/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

import { db } from '../db/db.js'
import {AppError} from "./errors.js";

export const Helpers = {

  urlFragmentParams: (url = window.location) => {
    return new URLSearchParams((url.hash.match(/\?(.+)$/) || [])[1] || '');
  },

  // Route path portion of the URL fragment: '#setup?x=1' -> 'setup', '#' or '' -> ''.
  hashPath: (url = window.location) => {
    return (url.hash.match(/^#([^?]*)/) || [])[1] || '';
  },

  getBaseUrl: (url) => new URL(Triauth.Helpers.getBaseUrl(String(url))),

  // True when a token row carries an expiry and it has passed; tokens without
  // expiresAt never expire.
  tokenExpired: (token) => !!(token?.expiresAt && token.expiresAt < Date.now()),

  parseRequest: (url, expectedType) => {
    const params = Helpers.urlFragmentParams(url);

    // Extract the challenge
    const challengeString = params.get('challenge');

    if (!Triauth.Validator.validateChallenge(challengeString).valid) {
      throw new AppError('challenge parameter is missing or invalid', {challengeString});
    }

    let challenge;
    try {
      challenge = Triauth.Challenge.fromString(challengeString);
    } catch(err) {
      throw new AppError('challenge parameter could not be decoded', {challengeString, cause:err});
    }

    // The flow type is bound by the endpoint path: each page signs only its own verb,
    // so a challenge minted for one flow never reaches another page's signer or consent UI.
    if (challenge.data.type !== expectedType) {
      throw new AppError('Challenge type does not match this endpoint', {challenge, expectedType});
    }

    // Protocol v1 is the only version this authenticator signs.
    if (challenge.data.ver !== 1) {
      throw new AppError('Challenge carries an unsupported protocol version', {challenge});
    }

    if (!Triauth.Validator.validateCallbackUrl(challenge.data.cburl).valid) {
      throw new AppError('Challenge contains invalid callbackUrl', {challenge});
    }

    const callbackUrl = new URL(challenge.data.cburl);
    const baseUrl = Helpers.getBaseUrl(callbackUrl);

    // Make sure that the ext provided with the request is valid
    if (Object.keys(challenge.data).includes('ext') && !Triauth.Validator.validateExt(challenge.data.ext)?.valid) {
      throw new AppError('Challenge contains invalid data.ext', {challenge});
    }
    const ext = challenge.data.ext || {};

    // Extract the request authentication code (HMAC) from the `token` parameter
    const tokenParam = params.get('token');
    let hmac = null;

    if (tokenParam !== null) {
      const parts = tokenParam.split(':');

      if (parts.length === 2 && Triauth.Helpers.isBase64UrlString(parts[1])) {
        hmac = parts[1];
      }
    }

    const identifier = challenge.identity.identifier;

    return {
      params,
      challengeString,
      challenge,
      hmac,
      identifier,
      ext,
      callbackUrl,
      baseUrl
    };
  },

  sendResponse: (method, url, responseString) => {
    url = new URL(url);

    if (method === 'GET') {
      url.searchParams.set('response', responseString);

      window.location.replace(url);

    } else if (method === 'HASH') {
      const hash = url.hash.slice(1); // drop leading '#'
      const [prefix, query = ''] = hash.split('?');
      const params = new URLSearchParams(query);
      params.set('response', responseString);
      url.hash = prefix + '?' + params.toString();

      window.location.replace(url);

    } else {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = url;

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'response';
      input.value = responseString;
      form.appendChild(input);

      document.body.appendChild(form);
      form.submit();
      setTimeout(() => form.remove(), 250);
    }
  },

  ensureValidHmac: async (hmac, tokenValue, challengeString) => {
    try {
      if (!Triauth.Helpers.isBase64UrlString(hmac) || !Triauth.Helpers.isBase64UrlString(challengeString)) {
        throw new AppError('Invalid format of hmac or challenge parameters', {hmac, challengeString});
      }

      const tokenKey = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(tokenValue),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
      );

      const isHmacValid = await crypto.subtle.verify(
        'HMAC', tokenKey,
        Triauth.Helpers.base64UrlToUint8(hmac),
        Triauth.Helpers.base64UrlToUint8(challengeString)
      );

      if (!isHmacValid) {
        throw new AppError('HMAC does not match');
      }

      return isHmacValid;

    } catch (err) {
      throw new AppError('HMAC verification failed', {hmac, challengeString, cause:err});

    }
  },

  ensureReferrerMatch: (baseUrl) => {
    if (!document.referrer) {
      throw new AppError('Could not determine the referring website address', {referrer:document.referrer, baseUrl:String(baseUrl)});
    }

    // Check origin if referrer is set
    if (document.referrer && new URL(document.referrer).origin !== new URL(baseUrl).origin) {
      throw new AppError('The referring website address is different than claimed', {referrer:document.referrer, baseUrl:String(baseUrl)});
    }

    return true;
  },

  // True only when a referrer is present and shares the callback URL's origin.
  // Used to decide whether to send a negative ('false') response back on deny/error.
  referrerMatchesCallback: (callbackUrl) => {
    if (!document.referrer) return false;
    try {
      return new URL(document.referrer).origin === new URL(callbackUrl).origin;
    } catch {
      return false;
    }
  },

  // Sanitizes the ext.manifest received from website on auth.html
  sanitizeManifest: (manifest, baseUrl) => {
    const clean = {};

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return clean;
    }

    // isNormalString admits spaces, so blank names need their own check
    const name = typeof manifest.name === 'string' ? manifest.name.trim() : '';
    if (name !== '' && Triauth.Helpers.isNormalString(name, 255)) {
      clean.name = name;
    }

    // A canonical URL always parses with the platform URL parser
    if (Triauth.Helpers.isCanonicalUrl(manifest.startUrl) && new URL(manifest.startUrl).origin === new URL(baseUrl).origin) {
      clean.startUrl = manifest.startUrl;
    }

    if (Triauth.Helpers.isCanonicalUrl(manifest.iconUrl)) {
      clean.iconUrl = manifest.iconUrl;
    }

    return clean;
  },

  safeFetch: async (url, reporter, {timeout, maxSize, allowedContentTypes, fileName}) => {
    const controller = new AbortController();

    // The finally below disarms this on every exit path, so the timer can only fire
    // while the request is genuinely in flight; ||= keeps the first recorded error.
    const timeoutId = setTimeout(() => {
      controller.abort();
      reporter.error ||= 'Request timed out';
    }, timeout || 60 * 60e3);

    try {
      let response;

      try {
        response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          redirect: 'follow',
          cache: 'no-store'
        });

      } catch (e) {
        Triauth.config.logger.error('Attachment fetch error', e);

        if (e.name === 'AbortError') {
          reporter.error ||= 'Request aborted';

        } else {
          reporter.error = 'Network error';

        }

        return null;
      }

      if (!response.ok) {
        const messages = {
          401: 'Unauthorized',
          403: 'Access was forbidden',
          404: 'Resource does not exist',
          429: 'Resource is temporarily unavailable',
          500: 'A server error has occurred',
          502: 'A server error has occurred',
          503: 'Service is temporarily unavailable',
          504: 'A server error has occurred'
        }

        reporter.error = `HTTP Error ${response.status} ${messages[response.status] || ''}`;
        return null;
      }

      const contentType = (response.headers.get('content-type') || '').split(';')[0];
      const contentLengthString = response.headers.get('content-length');
      const contentLength = contentLengthString ? parseInt(contentLengthString, 10) : null;

      if (allowedContentTypes) {
        const fileNameExtension = ((fileName?.match(/\.(.+)$/) || [])[1] || '').toLowerCase();

        if (
          !Object.keys(allowedContentTypes).includes(contentType) ||
          !allowedContentTypes[contentType].ext.includes(fileNameExtension)
        ) {
          Triauth.config.logger.error('Unsupported file format or extension', {contentType, fileNameExtension, allowedContentTypes});
          reporter.error = `Unsupported file format or extension`;
          return null;
        }

        reporter.viewable = allowedContentTypes[contentType].viewable;
        reporter.safe = allowedContentTypes[contentType].safe;
        reporter.icon = allowedContentTypes[contentType].icon;
      }

      reporter.contentType = contentType;
      reporter.contentLength = contentLength;

      if (contentLength && maxSize && contentLength > maxSize) {
        Triauth.config.logger.error('Attachment file is too large', {fileName, contentLength, maxSize});
        reporter.error = `File is too large (${Math.ceil(contentLength / 1024)} KB)`;
        return null;
      }

      const reader = response.body.getReader();
      const chunks = [];

      let receivedBytes = 0;
      reporter.receivedBytes = receivedBytes;

      while (true) {
        let done, value;

        try {
          ({ done, value } = await reader.read());

        } catch (e) {
          Triauth.config.logger.error('Attachment stream read error', e);
          reporter.error ||= 'Stream read error';
          return null;

        }

        if (done) break;

        receivedBytes += value.byteLength;
        reporter.receivedBytes = receivedBytes;

        // hard size limit enforced during streaming
        if (maxSize && receivedBytes > maxSize) {
          await reader.cancel();
          reporter.error = `File exceeds the ${maxSize} size limit. Download aborted.`;
          return null;
        }

        chunks.push(value);
      }

      const buffer = new Uint8Array(receivedBytes);
      let offset = 0;
      for (const c of chunks) { buffer.set(c, offset); offset += c.byteLength; }

      return buffer;

    } finally {
      clearTimeout(timeoutId);
    }
  },

  sha256Hexdigest: async (arrayBuffer) => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);

    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  },

  // Private-mode lookup code: 16 uniform characters of A-Z0-9
  generateLookupCode: () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    while (code.length < 16) {
      const [byte] = crypto.getRandomValues(new Uint8Array(1));
      if (byte < 252) code += alphabet[byte % 36];   // 252 = 7 * 36 keeps the modulo unbiased
    }
    return code;
  },

  formatLookupCode: (code) => code.match(/.{4}/g).join('-'),

  printConsoleWarning: () => {
    console.log(
      '%cDo not enter or paste any code here, as it may allow attackers to impersonate you',
      'color:#ff0000; font-weight:bold; font-size:24px;'
    );
  }

}

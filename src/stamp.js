/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

import { db } from './db/db.js'
import { Authenticator } from "./lib/authenticator.js";
import { Helpers } from "./lib/helpers.js";
import { isFramed } from "./lib/framing.js";

import './signers/default.js';
import "./signers/passphrase.js";
import "./signers/webauthn.js";

const run = async () => {
  try {
    const {
      params,
      challengeString,
      challenge,
      hmac,
      identifier,
      callbackUrl,
      baseUrl,
      ext
    } = Helpers.parseRequest(window.location, 'stamp');

    // Do the security checks for referrer
    Helpers.ensureReferrerMatch(baseUrl);

    try {
      // Try to keep the lookup at semi-constant time so that the existence of identifier is not revealed
      const identity = await db.find('identities', {identifier});
      const token = await db.find('tokens', {type: 'stampToken', identityId: identity?.id, baseUrl: baseUrl.href});
      if (!identity || !token || Helpers.tokenExpired(token)) {
        throw new Error('Identity or token not found or expired');
      }

      await Helpers.ensureValidHmac(hmac, token.value, challengeString);

      await db.patch('tokens', {id: token.id, lastUsedAt: Date.now()});

      const authenticator = new Authenticator(identity, identity.signers);

      if (authenticator.requiresInteraction('stamp')) {
        throw new Error('This request requires interaction and cannot be completed silently');
      }

      // Stamp is a silent flow, so the attacker-suppliable message must be bounded
      // before it is signed (isNormalString + protocol message size limit).
      if (!Triauth.Validator.validateMessage(challenge.data.msg).valid) {
        throw new Error('challenge.data.msg validation failed');
      }

      const signature = await authenticator.process('stamp', baseUrl.href, challenge.data.msg);

      Helpers.sendResponse(ext['callbackMethod'], callbackUrl, signature);

    } catch (err) {
      if (Helpers.referrerMatchesCallback(callbackUrl)) {
        Helpers.sendResponse(ext['callbackMethod'], callbackUrl, 'false');
      }

      throw err;
    }

  } catch (err) {
    document.body.innerText = 'This request has been denied. You can close this window or navigate back to the previous page.';

    throw err;
  }
}

if (!isFramed()) {
  window.addEventListener('hashchange', run);
  run();
}

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
  let session, challengeString;

  try {
    ({session, challengeString} = await Helpers.openRequest(window.location));

  } catch (err) {
    // A request that does not open gets no answer. Go back to the website, which counts the missing answer as a failure.
    if (window.history.length > 1) {
      window.history.back();
    } else {
      document.body.innerText = 'This request could not be opened. You can close this window.';
    }

    throw err;
  }

  try {
    const {
      challenge,
      identifier,
      callbackUrl,
      baseUrl,
      ext
    } = Helpers.parseChallenge(challengeString, 'ping');

    // Do the security checks for referrer
    Helpers.ensureReferrerMatch(baseUrl);

    try {
      const identity = await Helpers.sessionIdentity(session, identifier, baseUrl);

      if (!session.permissions.ping) {
        throw new Error('The user did not allow ping requests at sign-in');
      }

      await db.patch('sessions', {id: session.id, lastUsedAt: Date.now()});

      const authenticator = new Authenticator(identity, identity.signers);

      if (authenticator.requiresInteraction('ping')) {
        throw new Error('This request requires interaction and cannot be completed silently');
      }

      const signature = await authenticator.process('ping', baseUrl.href, String(challenge.challengeString));
      const {sealedResponse} = await Helpers.sealResponse(challenge, signature);

      Helpers.sendResponse(ext['callbackMethod'], callbackUrl, sealedResponse);

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

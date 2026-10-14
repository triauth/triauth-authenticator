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
    } = Helpers.parseChallenge(challengeString, 'stamp');

    // Do the security checks for referrer
    Helpers.ensureReferrerMatch(baseUrl);

    try {
      const identity = await Helpers.sessionIdentity(session, identifier, baseUrl);

      if (!session.permissions.stamp) {
        throw new Error('The user did not allow stamp requests at sign-in');
      }

      await db.patch('sessions', {id: session.id, lastUsedAt: Date.now()});

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

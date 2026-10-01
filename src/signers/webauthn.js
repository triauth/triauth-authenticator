/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

import BaseSigner from "./base.js";
import CryptoHelpers from "../lib/cryptoHelpers.js"

class WebauthnSigner extends BaseSigner {

  type = 'webauthn';

  icon = 'SecurityKey';
  factor = 'are';

  use = ['attest', 'auth', 'sign'];
  interactive = true;

  t = {
    title: 'An external security key'
  }

  async setup(context={}) {
    const credentialChallenge = crypto.getRandomValues(new Uint8Array(32));
    const rpId = window.location.hostname;

    const userId = crypto.getRandomValues(new Uint8Array(16));
    const userName = context.identifier;

    // @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: credentialChallenge,
        rp: { name: 'Triauth Authenticator', id: rpId },
        user: {
          id: userId,
          name: userName,
          displayName: userName
        },
        pubKeyCredParams: [{ alg: -7, type: "public-key" }],
        timeout: 60000
      }
    });

    // Extract the public key in triauth publishableKey format from the credentials.create
    // response; older browsers (e.g. Safari < 15.5) lack getPublicKey(), so fall back to
    // digging the key out of the attestation object.
    const spki = credential.response.getPublicKey?.();
    const rawKey = spki
      ? CryptoHelpers.spkiToRaw(spki)
      : CryptoHelpers.attestationToRawP256(credential.response.attestationObject);
    this.publishableKey = Triauth.Helpers.arrayBufferToBase64Url(rawKey);

    const credentialRawId = credential.rawId;
    const credentialJSON = JSON.stringify(credential);

    this.data = {
      rpId, userId, userName, credentialRawId, credentialJSON
    }

    return this;
  }

  async sign(message, context, signedData, unsignedData) {

    const webAuthnChallenge = new Uint8Array(await crypto.subtle.digest('SHA-256', message));

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: webAuthnChallenge,
        rpId: this.data.rpId,
        allowCredentials: [{
          id: this.data.credentialRawId,   // the rawId from registration
          type: "public-key"
        }],
        timeout: 60000
      }
    });

    const signature = CryptoHelpers.derToP1363(assertion.response.signature);

    const clientDataJSON = new TextDecoder().decode(assertion.response.clientDataJSON);
    const authenticatorData = Triauth.Helpers.arrayBufferToBase64Url(assertion.response.authenticatorData);

    unsignedData.sig ||= {}
    unsignedData.sig[context.idx] = {authenticatorData, clientDataJSON}

    return Triauth.Helpers.arrayBufferToBase64Url(signature);
  }

  publishableKeyOptions() {
    return {
      'type': 'webauthn-es256',
      'use': this.use.join(',')
    }
  }


}

BaseSigner.registerSigner('webauthn', WebauthnSigner);

export default WebauthnSigner;

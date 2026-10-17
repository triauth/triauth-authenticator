/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

import BaseSigner from "./base.js";
import CryptoHelpers from "../lib/cryptoHelpers.js";
class DefaultSigner extends BaseSigner {

  type = 'default';

  icon = 'Key';
  factor = 'have';

  t = {
    title: 'Cryptographic key stored by a browser on this device'
  }

  async setup() {
    const cryptoKeys = await window.crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      false, // isExtractable
      ['sign', 'verify']
    );

    this.publishableKey = Triauth.Helpers.arrayBufferToBase64Url(CryptoHelpers.compressP256(await crypto.subtle.exportKey('raw', cryptoKeys.publicKey)));
    this.data = cryptoKeys;

    return this;
  }

  async sign(message, context, signedData, unsignedData) {
    const signature = await window.crypto.subtle.sign(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
        hash: 'SHA-256'
      },
      this.data.privateKey,
      message
    );

    return Triauth.Helpers.arrayBufferToBase64Url(signature);
  }

  // No options: `type=es256` and a `use` of every verb are the protocol defaults
  publishableKeyOptions() {
    return {}
  }

}

BaseSigner.registerSigner('default', DefaultSigner);

export default DefaultSigner;

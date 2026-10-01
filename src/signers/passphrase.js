/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

import BaseSigner from "./base.js";
import { promptPassphrase } from "../lib/passphrasePrompt.js";

// Current PBKDF2 work factor (the OWASP floor for PBKDF2-HMAC-SHA256). Stored per key
// in data.iterations so the default can be raised later without breaking existing keys.
const PBKDF2_ITERATIONS = 600_000;

// Minimum passphrase length, enforced in the prompt UI and again here at key creation.
const MIN_PASSPHRASE_LENGTH = 8;

class PassphraseSigner extends BaseSigner {

  type = 'passphrase';

  icon = 'Password';
  factor = 'know';

  use = ['attest', 'auth', 'sign'];
  interactive = true;

  t = {
    title: 'Passphrase protected cryptographic key'
  }

  async setup() {
    const passphrase = await promptPassphrase({ title: 'Create a passphrase', confirm: true, minLength: MIN_PASSPHRASE_LENGTH });
    if (passphrase === null) {
      throw new Error('User aborted');
    }
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      throw new Error('Passphrase too short');
    }

    // 1. Import the passphrase as a PBKDF2 key
    const passphraseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // 2. Derive an AES wrapping key from the passphrase
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const wrappingKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      passphraseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    );

    // 3. Generate the ECDSA key pair (private key is extractable, but not stored)
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true, // must be extractable to avoid InvalidAccessError: key is not extractable
      ['sign', 'verify']
    );

    // 4. Wrap (encrypt) the private key with the password-derived key
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrappedPrivateKey = await crypto.subtle.wrapKey(
      'pkcs8',
      keyPair.privateKey,
      wrappingKey,
      { name: 'AES-GCM', iv }
    );

    this.publishableKey = Triauth.Helpers.arrayBufferToBase64Url(await crypto.subtle.exportKey('raw', keyPair.publicKey));
    this.data = {salt, iv, wrappedPrivateKey, iterations: PBKDF2_ITERATIONS};

    return this;
  }

  async sign(message, context, signedData, unsignedData) {

    const passphrase = await promptPassphrase({ title: 'Enter your passphrase' });
    if (passphrase === null) {
      throw new Error('User aborted');
    }

    // 1. Import the passphrase as a PBKDF2 key
    const passphraseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // 2. Derive an AES wrapping key from the passphrase
    const salt = this.data.salt;
    const iterations = this.data.iterations || PBKDF2_ITERATIONS; // fallback for keys made before iterations were stored
    const wrappingKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      passphraseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    );

    const privateKey = await crypto.subtle.unwrapKey(
      'pkcs8',
      this.data.wrappedPrivateKey,
      wrappingKey,
      { name: 'AES-GCM', iv: this.data.iv },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, // <-- make the privateKey non-extractable after unwrapping
      ['sign']
    );

    const signature = await window.crypto.subtle.sign(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
        hash: 'SHA-256'
      },
      privateKey,
      message
    );

    return Triauth.Helpers.arrayBufferToBase64Url(signature);
  }

  publishableKeyOptions() {
    return {
      'type': 'es256',
      'use': this.use.join(',')
    }
  }

}

BaseSigner.registerSigner('passphrase', PassphraseSigner);

export default PassphraseSigner;

/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

import BaseSigner from "../signers/base.js";
import { AppError } from "./errors.js";

export const Authenticator = class Authenticator {

  constructor(identity, signers) {
    this.identity = identity;
    this.signers = signers;
  }

  _normalizeData(data) {
    if (typeof data === 'string') {
      return new TextEncoder().encode(data);
    }
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      return data;
    }
    throw new AppError('Unexpected payload type', {type: typeof data});
  }

  async process(type, via, message, signedData = {}, unsignedData = {}) {
    Triauth.config.logger.debug('Authenticator processing a request for', type, via, message, signedData, unsignedData);

    // Private-mode identities resolve only through their lookup code
    if (this.identity.lookupCode) {
      signedData = {...signedData, lookupCode: this.identity.lookupCode};
    }

    const retval = await Triauth.Signature.generate(
      async (payload, unsignedMetadataRef) => {
        const resp = [];
        const signPayload = this._normalizeData(payload);

        for (let i = 0; i < this.signers.length; i++) {
          const serialized = this.signers[i];
          const use = serialized.options?.use;
          // Skip signers whose key isn't scoped for this verb; the verifier
          // independently marks such keys 'skipped' (their published `use` excludes it).
          // The loop index is preserved so WebAuthn's unsignedData.sig[idx] still maps.
          if (Array.isArray(use) && !use.includes(type)) {
            continue;
          }
          const signer = BaseSigner.deserialize(serialized);
          const encodedSignature = await signer.sign(signPayload, {idx:i}, signedData, unsignedMetadataRef);
          resp.push(encodedSignature);
        }

        return resp;
      },
      type,
      this.identity.identifier,
      '',
      via,
      message,
      signedData,
      unsignedData
    );

    Triauth.config.logger.debug('Authenticator signed the request with', retval);

    return retval;
  }

  // True if any signer applicable to `type` (per its stored `use`) requires user
  // interaction. Silent verbs (ping/stamp) use this to refuse up front.
  requiresInteraction(type) {
    return this.signers.some((s) => {
      const use = s.options?.use;
      const applies = !Array.isArray(use) || use.includes(type);
      return applies && BaseSigner.deserialize(s).interactive;
    });
  }

};

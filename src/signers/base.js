/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

class BaseSigner {

  static #SIGNERS_REGISTRY = {
  }

  // Which protocol verbs this key applies to (published in the DNS key record as
  // `use=...`). The verifier marks a key 'skipped' for verbs not listed here.
  use = ['attest', 'auth', 'ping', 'sign', 'stamp'];

  // Whether signing requires user interaction (a "know"/"are" factor). Silent verbs
  // (ping/stamp) refuse up front when an applicable signer is interactive.
  interactive = false;

  serialize() {
    return {
      'type': this.type,
      'options': {use: this.use},
      'publishableKey': this.publishableKey,
      'data': this.data
    }
  }

  static deserialize(rawObject) {
    const klass = this.#SIGNERS_REGISTRY[rawObject.type];

    const retval = new klass();

    retval.publishableKey = rawObject.publishableKey;
    retval.data = rawObject.data;

    return retval;
  }

  static registerSigner(type, klass) {
    this.#SIGNERS_REGISTRY[type] = klass;
  }

}

export default BaseSigner;
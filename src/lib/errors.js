/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

export class AppError extends Error {
  constructor(message, data={}) {
    super(message, {cause:data.cause});
    this.name = this.constructor.name;

    this.data = Object.assign({}, data);
    delete this.data.cause;

    this.timestamp = new Date();
  }
}

// The user dismissed a signer's prompt, so nothing was signed. The request stays open to be approved again.
export class CancelledError extends AppError {}

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

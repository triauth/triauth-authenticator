/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

import { reactive } from 'vue';

// Bridges imperative signer code (passphrase setup()/sign()) to a Vue-rendered prompt.
// A <PassphrasePrompt> host is mounted in each interactive App; on the headless
// ping/stamp pages no host is mounted, so requests reject. (Those silent verbs skip
// interactive signers anyway — see Authenticator.requiresInteraction / the use-scoping.)

export const passphrasePromptState = reactive({ request: null });

let hostCount = 0;
let resolveActive = null;

// Called by the host component on mount/unmount; returns an unregister function.
export function registerPassphraseHost() {
  hostCount++;
  return () => { hostCount--; };
}

// Resolves with the entered passphrase, or null if the user cancels.
export function promptPassphrase({ title, confirm = false, minLength = 0 } = {}) {
  if (hostCount === 0) {
    return Promise.reject(new Error('Passphrase entry is not available in this context'));
  }
  return new Promise((resolve) => {
    resolveActive = resolve;
    passphrasePromptState.request = { title, confirm, minLength };
  });
}

// Called by the host component to finish the active request.
export function _settlePassphrase(value) {
  const resolve = resolveActive;
  resolveActive = null;
  passphrasePromptState.request = null;
  if (resolve) resolve(value);
}

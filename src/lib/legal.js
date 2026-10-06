/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

// Legal wiring for WelcomePage.vue and Footer.vue.
//
// The Terms of Service / Privacy Policy are operator documents, not part of the software:
// whoever operates an instance publishes their own documents and injects their URLs
// at build time (e.g. via the Cloudflare Pages build environment):
//
//   VITE_TERMS_OF_SERVICE_URL=https://www.triauth.org/legal/terms
//   VITE_PRIVACY_POLICY_URL=https://www.triauth.org/legal/privacy
//
// An unset URL means the app renders no link to that document and requests no
// agreement to it, so unconfigured forks and self-hosted copies never present the
// official operator's terms as their own.

const httpsUrlOrNull = (value) => {
  const url = String(value || '').trim();
  if (!url) return null;
  if (!url.startsWith('https://')) {
    console.warn(`Ignoring configured legal document URL that is not https: ${url}`);
    return null;
  }
  return url;
};

export const TERMS_URL = httpsUrlOrNull(import.meta.env.VITE_TERMS_OF_SERVICE_URL);
export const PRIVACY_URL = httpsUrlOrNull(import.meta.env.VITE_PRIVACY_POLICY_URL);

// Do not set or modify the VITE_OFFICIAL_INSTANCE when self-hosting
export const IS_OFFICIAL_INSTANCE = (window.location.hostname === 'auth.triauth.org' || import.meta.env.VITE_OFFICIAL_INSTANCE === 'true');

// The official instance must present both documents: a build that reaches auth.triauth.org
// without them is a deployment mistake, so the welcome page refuses to let anyone in.
export const LEGAL_MISCONFIGURED = IS_OFFICIAL_INSTANCE && (TERMS_URL !== 'https://www.triauth.org/legal/terms' || PRIVACY_URL !== 'https://www.triauth.org/legal/privacy');

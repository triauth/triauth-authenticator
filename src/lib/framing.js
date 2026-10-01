/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

// The pages must not run inside another page. The primary control is the `frame-ancestors 'none'`
// and `X-Frame-Options: DENY` pair that public/_headers and the Caddyfile send; a <meta> CSP cannot
// carry frame-ancestors, so a host that ignores those files would serve a frameable consent page.
// Cross-site frames see partitioned, empty storage in current browsers, but same-site frames (a
// sibling subdomain, another port of the same host) do not, hence this second, host-independent
// check: when it is true, the entry point simply does not run.
export const isFramed = () => window.top !== window.self;

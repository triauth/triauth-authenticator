/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

// The icon download dedicated worker (workers/iconFetcher.js) so that auth.html keeps its
// `connect-src 'none'`. `?worker` makes Vite emit it as a same-origin script
import IconFetcher from '../workers/iconFetcher.js?worker';

// The approval redirect waits at most this long for the icon (ms)
export const ICON_FETCH_BUDGET = 3e3;

// Largest download accepted
export const ICON_MAX_BYTES = 128 * 1024;

// Longest data URL accepted back from the worker
const ICON_MAX_DATA_URL_LENGTH = 128 * 1024;

// Downloads the icon at `url` and resolves to `{url, dataUrl, fetchedAt}`, or to null on any failure
// or once the budget is spent. Never throws.
export function captureIcon(url) {
  return new Promise((resolve) => {
    let worker = null;
    let timer = null;

    const finish = (icon) => {
      clearTimeout(timer);
      worker?.terminate();
      resolve(icon);
    };

    // A little longer than the worker's own fetch timeout, so that its verdict normally arrives first
    timer = setTimeout(() => finish(null), ICON_FETCH_BUDGET + 500);

    try {
      worker = new IconFetcher();
    } catch (err) {
      // e.g. worker creation refused by an engine without worker-src support
      Triauth.config.logger.warn('Shortcut icon worker could not be started', err);
      return finish(null);
    }

    worker.onmessage = ({data}) => {
      const ok = data?.ok === true && typeof data.dataUrl === 'string'
        && data.dataUrl.startsWith('data:image/png;base64,') && data.dataUrl.length <= ICON_MAX_DATA_URL_LENGTH;

      if (!ok) {
        Triauth.config.logger.warn('Shortcut icon was not captured', {url, error: data?.error});
      }

      finish(ok ? {url, dataUrl: data.dataUrl, fetchedAt: Date.now()} : null);
    };

    worker.onerror = (event) => {
      Triauth.config.logger.warn('Shortcut icon worker failed', {url, message: event?.message});

      finish(null);
    };

    worker.postMessage({url, maxBytes: ICON_MAX_BYTES, timeout: ICON_FETCH_BUDGET});
  });
}

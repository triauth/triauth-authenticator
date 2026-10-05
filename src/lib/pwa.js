/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

import { ref } from 'vue';

// All install / storage-durability state for the app, in one module.
//
// It is imported (via components) from main.js's static graph, so the module-level
// listeners below are registered during bundle evaluation - long before Chromium can
// fire beforeinstallprompt (it requires ~30s of user engagement first). No inline
// <head> script is needed (the CSP would forbid one anyway).
//
// Durability facts this module leans on (researched 2026-07):
// - Chromium grants persist() silently for installed / bookmarked / engaged origins;
//   a denial is not sticky, so persist() is re-requested after installation.
// - Firefox shows a real permission prompt for persist(); there is no manifest install.
// - WebKit grants persist() heuristically, but ITP can still delete script-writable
//   storage after 7 browser-use days without first-party interaction. Home Screen /
//   Dock apps are exempt, so persisted() alone does not remove the inactivity risk.
// - iOS home-screen web apps have a storage partition SEPARATE from Safari: installing
//   one does not make its storage available to browser-based authentication redirects.

// The service worker and the eager persist() request belong to the manage app only;
// the flow pages (auth/sign/attest/ping/stamp) keep worker-src 'none' in their CSP.
const onManagePage = ['/', '/index.html'].includes(window.location.pathname);

////
// Install prompt (Chromium only)

export const installAvailableRef = ref(false);
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // also suppresses Chrome's own install mini-infobar
  deferredInstallPrompt = event;
  installAvailableRef.value = true;
});

window.addEventListener('appinstalled', () => {
  installAvailableRef.value = false;
  deferredInstallPrompt = null;
  clearBannerDismissal();
  // Installation flips Chromium's persistent-storage heuristic, but only a fresh
  // persist() call picks the grant up - and the grant can lag behind this event,
  // so retry a couple of times.
  refreshPersisted();
  setTimeout(refreshPersisted, 2e3);
  setTimeout(refreshPersisted, 8e3);
});

// Must be called from a user gesture; the captured event is single-use.
export async function promptInstall() {
  if (!deferredInstallPrompt) {
    return false;
  }
  const {outcome} = await deferredInstallPrompt.prompt();
  deferredInstallPrompt = null;
  installAvailableRef.value = false;
  return outcome === 'accepted';
}

////
// Environment detection

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS with desktop UA

export const isSafari = () =>
  /Safari\//.test(navigator.userAgent) && !/Chrom(e|ium)|Edg|OPR|Android/.test(navigator.userAgent);

export const isFirefox = () => /Firefox\//.test(navigator.userAgent);

export const isAndroid = () => /Android/.test(navigator.userAgent);

////
// Persistent storage
// null = unknown or unsupported; true/false = the persisted() verdict.

export const persistedRef = ref(null);

export async function refreshPersisted() {
  if (!(navigator.storage && navigator.storage.persist)) {
    return null;
  }

  if (!await navigator.storage.persisted()) {
    await navigator.storage.persist();
  }
  persistedRef.value = await navigator.storage.persisted();

  return persistedRef.value;
}

////
// Durability-banner dismissal (snoozed, so the nudge returns eventually)

const DISMISS_KEY = 'durabilityBannerDismissedAt';

// The snooze scales with the threat's time constant: Safari's ITP deletes after 7 days
// of non-use, so hiding the warning for a month there would outlast the danger window
// several times over; Chromium/Firefox eviction is rare and pressure-driven, where a
// shorter snooze would only train reflex-dismissal.
const RENUDGE_DAYS = (isIos() || isSafari()) ? 7 : 30;

const isBannerDismissed = () => {
  const at = Number(window.localStorage.getItem(DISMISS_KEY));
  return !!at && (Date.now() - at) < RENUDGE_DAYS * 86400e3;
};

export const bannerDismissedRef = ref(isBannerDismissed());

export function dismissBanner() {
  window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  bannerDismissedRef.value = true;
}

export function clearBannerDismissal() {
  window.localStorage.removeItem(DISMISS_KEY);
  bannerDismissedRef.value = false;
}

////
// Boot (manage app only)

if (onManagePage) {
  refreshPersisted();

  // Bookmarking is one of Chromium's silent persist() grant triggers, but nothing
  // notifies the page about it - re-check when the window regains focus (e.g. right
  // after the user finishes the browser's bookmark popup) so the durability nudge can
  // dismiss itself. Chromium only: Firefox's persist() opens a permission prompt
  // (focus-nagging), and on WebKit the grant is not a durability signal anyway.
  if (!isFirefox() && !isSafari() && !isIos()) {
    window.addEventListener('focus', () => {
      if (persistedRef.value === false) {
        refreshPersisted();
      }
    });
  }

  // Offline shell - see public/sw.js for the (network-first) caching contract.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        Triauth.config.logger.error('Service worker registration failed', err);
      });
    });
  }
}

<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<script setup>
import { computed, ref } from 'vue';
import {
  persistedRef, installAvailableRef, bannerDismissedRef,
  promptInstall, dismissBanner, clearBannerDismissal, refreshPersisted,
  isStandalone, isIos, isSafari, isAndroid
} from '../lib/pwa.js';

import CloseIcon from '../../vendor/material-icons/Close.vue';

// WebKit browsers require regular interaction even when persist() reports success.
// Standalone WebKit apps are exempt from that inactivity rule, but on iOS their storage is isolated.
const activityRequired = (isIos() || isSafari()) && !isStandalone();

// On Android we show the install prompt
const android = isAndroid();

// The prompt was accepted: the grant trails the install by a few seconds, during which the card keeps its install line.
const installAccepted = ref(false);

const atRiskRef = computed(() => activityRequired || persistedRef.value === false);

const visibleRef = computed(() => atRiskRef.value && !bannerDismissedRef.value);

// While the card is snoozed but the risk persists, a quiet corner indicator keeps the
// fact discoverable; clicking it lifts the snooze and reopens the card.
const indicatorRef = computed(() => atRiskRef.value && bannerDismissedRef.value);

const title = 'Stay ready to sign in';

async function install() {
  installAccepted.value = await promptInstall();
  await refreshPersisted();
}
</script>

<template>
  <Transition name="nudge">
    <div
      v-if="visibleRef"
      class="fixed bottom-12 right-4 left-4 sm:left-auto sm:w-[420px] z-40 p-4 rounded-lg border border-gray-200 border-l-4 border-l-amber-400 bg-white shadow-lg text-left"
    >
      <div class="flex items-start gap-2">
        <div class="grow">
          <div class="text-sm font-semibold text-gray-900 mb-1">{{ title }}</div>

          <div class="text-sm text-gray-600 leading-relaxed">
            <template v-if="activityRequired">
              Safari on Mac and all browsers on iPhone and iPad may clear sign-in keys after a week without use.
              Use triauth regularly or keep another device registered.
            </template>
            <template v-else-if="android">
              This browser may remove your sign-in keys to free space.
              <template v-if="installAvailableRef || installAccepted">Installing keeps them stored.</template>
              <template v-else>Add this website to your home screen from the browser menu to keep them stored.</template>
            </template>
            <template v-else>
              This browser may remove your sign-in keys to free space.
              Bookmark this page (Ctrl/Cmd&nbsp;+&nbsp;D),
              <template v-if="installAvailableRef">
                <a href="#" class="underline text-gray-700 hover:text-gray-900" @click.prevent="install">install it</a>,
              </template>
              and/or make it your default new tab page to help keep them stored.
            </template>
          </div>
        </div>

        <a href="#" class="shrink-0 -m-1 p-1 text-gray-400 hover:text-gray-600" aria-label="Dismiss" @click.prevent="dismissBanner"><CloseIcon/></a>
      </div>

      <Button class="w-full mt-3" @click="install" v-if="android && installAvailableRef">Install app</Button>
    </div>
  </Transition>

  <Transition name="nudge">
    <button
        type="button" v-if="indicatorRef"
        class="fixed bottom-3 left-3 z-40 inline-flex items-center gap-1.5
           rounded-full border border-blue-200 bg-blue-50/95
           px-3 py-2 text-xs font-medium text-blue-700 shadow-sm
           transition hover:border-blue-300 hover:bg-blue-100
           focus-visible:outline-none focus-visible:ring-2
           focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
        @click="clearBannerDismissal"
    >
      <span aria-hidden="true">ⓘ</span>
      <span>Stay ready to sign in</span>
    </button>
  </Transition>
</template>

<style scoped>
.nudge-enter-active,
.nudge-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.nudge-enter-from,
.nudge-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>

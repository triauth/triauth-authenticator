<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<script setup>
import {TERMS_URL, PRIVACY_URL} from "../lib/legal.js";

// package.json's version, injected at build time via `define` in vite.config.js.
const version = __APP_VERSION__;

// Where this build came from. Resolved in vite.config.js.
const sourceUrl = __APP_SOURCE_URL__ || 'https://github.com/triauth/triauth-authenticator';
</script>

<template>
  <footer class="px-4 py-2 text-xs text-gray-400 text-center sm:text-right">
    <a :href="sourceUrl" target="_blank" rel="noopener noreferrer">triauth-authenticator v{{ version }}</a><template v-if="TERMS_URL"> | <a :href="TERMS_URL" target="_blank" rel="noopener noreferrer">Terms</a></template><template v-if="PRIVACY_URL"> | <a :href="PRIVACY_URL" target="_blank" rel="noopener noreferrer">Privacy</a></template>
  </footer>
</template>

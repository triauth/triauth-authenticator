<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<script setup>
import {TERMS_URL, PRIVACY_URL} from "../lib/legal.js";

// package.json's version, injected at build time via `define` in vite.config.js.
const version = __APP_VERSION__;
</script>

<template>
  <div style="position:fixed;bottom:0;right:0;font-size:0.75rem;background-color:#fbf9faaa;padding:0.5rem 1rem;" class="text-gray-400 rounded-2xl">
    <a href="https://github.com/triauth/triauth-authenticator" target="_blank" rel="noopener noreferrer">triauth-authenticator v{{ version }}</a><template v-if="TERMS_URL"> | <a :href="TERMS_URL" target="_blank" rel="noopener noreferrer">Terms</a></template><template v-if="PRIVACY_URL"> | <a :href="PRIVACY_URL" target="_blank" rel="noopener noreferrer">Privacy</a></template>
  </div>
</template>

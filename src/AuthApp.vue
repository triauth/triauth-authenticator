<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<script setup>
import AuthPage from "./components/AuthPage.vue";
import Footer from "./components/Footer.vue";
import PassphrasePrompt from "./components/PassphrasePrompt.vue";

// The accepted terms are checked by AuthPage once it knows the identity
</script>

<template>
  <main class="grow">
    <Suspense>
      <AuthPage/>
    </Suspense>
  </main>
  <Footer/>
  <PassphrasePrompt/>
</template>

<style scoped>

</style>

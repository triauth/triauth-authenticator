<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<script setup>
import SetupWizard from './components/SetupWizard.vue'
import IndexPage from "./components/IndexPage.vue";
import HomePage from "./components/HomePage.vue";

import {onMounted, shallowRef} from "vue";
import WelcomePage from "./components/WelcomePage.vue";
import Footer from "./components/Footer.vue";
import PassphrasePrompt from "./components/PassphrasePrompt.vue";
import StorageDurabilityBanner from "./components/StorageDurabilityBanner.vue";
import {Helpers} from "./lib/helpers.js";
import {db} from "./db/db.js";

const currentView = shallowRef(null);

const onHashChange = () => {
  try {
    const path = Helpers.hashPath(window.location);
    const params = Helpers.urlFragmentParams(window.location);
    const termsAccepted = window.localStorage.getItem('termsAcceptedAt');

    if(!termsAccepted) {
      currentView.value = WelcomePage;
      return;
    }

    // The bare URL is the entry point (the installed app's start_url, a bookmark, a typed address): a single identity
    // opens directly, several show the list, none start the setup.
    if (!path) {
      db.list('identities').then((ids) => {
        if (Helpers.hashPath(window.location)) return;   // the user moved on in the meantime
        const identities = Object.values(ids);
        window.location.replace(identities.length === 1 ? '#' + identities[0].identifier : identities.length ? '#index' : '#setup');
      }).catch(() => window.location.replace('#index'));
      return;
    }

    const routes = {
      'setup': SetupWizard,
      'index': IndexPage
    }

    if (routes[path]) {
      currentView.value = routes[path];
    } else if (Triauth.validate({identifier:path}).valid) {
      currentView.value = HomePage;
    }


  } catch (err) {
    currentView.value = null;

  }
}
onHashChange();
onMounted(() => window.addEventListener('hashchange', onHashChange));

// Housekeeping: drop expired tokens left behind by abandoned flows
db.sweepExpired('tokens').catch((err) => Triauth.config.logger.error(err));

</script>

<template>
  <main class="grow">
    <Transition name="fade" mode="out-in">
      <Component :is="currentView" v-if="currentView"/>
    </Transition>
  </main>

  <!-- Durability nudge only on the identity/home views - never over the wizard or welcome -->
  <StorageDurabilityBanner v-if="currentView === IndexPage || currentView === HomePage"/>

  <Footer/>
  <PassphrasePrompt/>
  <ConfirmDialog style="max-width:min(90vw,480px);"/>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

import { createApp } from 'vue'

import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import { definePreset } from "@primeuix/themes";

import './style.css'

import IndexApp from './IndexApp.vue'
import AuthApp from './AuthApp.vue';
import AttestApp from './AttestApp.vue';
import SignApp from "./SignApp.vue";

import {Helpers} from "./lib/helpers.js";
import {isFramed} from "./lib/framing.js";

if (isFramed()) {
  throw new Error('Not running inside another page');
}

let app;
const path = window.location.pathname;

if (path === '/' || path === '/index.html') {
  app = createApp(IndexApp);
} else if (path === '/auth.html') {
  app = createApp(AuthApp);
} else if (path === '/attest.html') {
  app = createApp(AttestApp);
} else if (path === '/sign.html') {
  app = createApp(SignApp);
}

const Blue = definePreset(Aura, {
  semantic: {
    primary: {
      50:  '{blue.50}',
      100: '{blue.100}',
      200: '{blue.200}',
      300: '{blue.300}',
      400: '{blue.400}',
      500: '{blue.500}',
      600: '{blue.600}',
      700: '{blue.700}',
      800: '{blue.800}',
      900: '{blue.900}',
      950: '{blue.950}'
    }
  }
})

if (!app) {
  throw new Error('Page not found');
}

app.use(PrimeVue, {
  theme: {
    preset: Blue,
    options: {
      darkModeSelector: false
    }
  }
})

import ConfirmationService from 'primevue/confirmationservice';
app.use(ConfirmationService);

import Button from "primevue/button";
app.component('Button', Button);

import InputText from 'primevue/inputtext';
app.component('InputText', InputText);

import Message from 'primevue/message';
app.component('Message', Message);

import Tag from 'primevue/tag';
app.component('Tag', Tag);

import Avatar from 'primevue/avatar';
app.component('Avatar', Avatar);

import Toolbar from 'primevue/toolbar';
app.component('Toolbar', Toolbar);

import Select from 'primevue/select';
app.component('Select', Select);

import ProgressBar from 'primevue/progressbar';
app.component('ProgressBar', ProgressBar);

import {InputMask} from "primevue";
app.component('InputMask', InputMask);

import ConfirmDialog from 'primevue/confirmdialog';
app.component('ConfirmDialog', ConfirmDialog);

app.mount('#app');

Helpers.printConsoleWarning();
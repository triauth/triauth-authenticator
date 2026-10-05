<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<script setup>

import { computed, ref } from 'vue';
import { Authenticator } from "../lib/authenticator.js";
import { Helpers } from "../lib/helpers.js";
import {AppError} from "../lib/errors.js";
import { captureIcon } from "../lib/shortcutIcon.js";

import { db } from '../db/db.js'

// One of 'verifying', 'error', 'pending'
const stateRef = ref('verifying');

let challenge = null;
let baseUrl = null;
let identity = null;
let website = null;

let callbackMethod = 'POST';
let callbackUrl = null;

const requestedExt = {};

const permissionSwitchesRef = ref({});

// Every token a website may request; each requested one is minted on approval (see confirm())
const TOKEN_TYPES = ['pingToken', 'signToken', 'stampToken', 'attestToken'];

// The tokens that later sign with no prompt are listed on the consent screen
const SILENT_GRANT_DESCRIPTIONS = {
  pingToken: 'verify your session in the background while you use it',
  stampToken: 'prove to other websites that you are signed in'
};

// The private profile fields that a grant shares: the non-empty ones. The consent screen lists
// exactly these keys and confirm() sends exactly this object.
const sharedPrivateProfile = () =>
  Object.fromEntries(Object.entries(identity?.privateProfile || {}).filter(([, v]) => !!v));

const privateProfileFieldsRef = computed(() => Object.keys(sharedPrivateProfile()).join(', '));

// The silent grants the website requested, displayed as a list on the consent screen
const grantsRef = computed(() =>
  Object.entries(SILENT_GRANT_DESCRIPTIONS).filter(([k]) => requestedExt[k]).map(([key, text]) => ({key, text}))
);

const errorMessageRef = ref('');

const inCoolOffPeriodRef = ref(false);

const busyRef = ref(false);

setup();

async function setup() {
  try {
    const requestData = Helpers.parseRequest(window.location, 'auth');
    const {identifier, ext} = requestData;

    challenge = requestData.challenge;
    baseUrl = requestData.baseUrl;
    callbackUrl = requestData.callbackUrl;

    // Do the security checks for referrer
    Helpers.ensureReferrerMatch(baseUrl);

    // Load the requested identity
    identity = await db.find('identities', {identifier});

    if (!identity) {
      throw new AppError(`A website tried to authenticate ${identifier} but this browser is not yet configured with this identifier.`, {identifier, baseUrl:baseUrl.href});
    }

    ////
    // Load or build a record for the website which is requesting the authentication
    website = await db.find('websites', {identityId:identity.id, baseUrl:baseUrl.href});

    if (!website) {
      website = {
        identityId: identity.id,
        baseUrl: baseUrl.href,
        permissions: {},
        createdAt: Date.now()
      };
    }

    // Extract the ext from challenge, filter through whitelist, normalize, and store in requestedExt
    for (const [k,v] of Object.entries(ext)) {
      if (['privateProfile'].indexOf(k) >= 0) {
        requestedExt[k] = v === true;

        if (requestedExt[k]) {
          permissionSwitchesRef.value[k] = Object.keys(website.permissions).includes(k) ? !!website.permissions[k] : false;
        }

      } else if (TOKEN_TYPES.indexOf(k) >= 0) {
        requestedExt[k] = !!v;

      } else if (k === 'manifest') {
        requestedExt[k] = Helpers.sanitizeManifest(v, baseUrl);

      } else if (k === 'callbackMethod' && Triauth.Helpers.isNormalString(v)) {
        callbackMethod = v;
      }
    }

    ////
    // Tile metadata is rebuilt on every approval: defaults from the callback's base URL, overlaid
    // with the conforming members the site sent this time (see Helpers.sanitizeManifest). Latest wins,
    // so a member the site stops sending falls back to its default instead of lingering from an
    // earlier consent. Nothing is stored before the user approves.
    website.manifest = {name: baseUrl.host, startUrl: baseUrl.href, ...requestedExt.manifest};

    ////
    // Hold the Approve button for a moment on a first sign-in to this website
    if (!website.id) {
      inCoolOffPeriodRef.value = true;
      setTimeout(() => inCoolOffPeriodRef.value = false, 1e3);
    }

    stateRef.value = 'pending';

  } catch (err) {
    Triauth.config.logger.error(err, err.data);
    stateRef.value = 'error';
    errorMessageRef.value = err instanceof AppError ? err.message : 'Internal error has occurred';

  }
}

async function clearTokens() {
  const existingTokens = await db.list('tokens', {identityId:identity.id, baseUrl:baseUrl.href});
  for (const {id} of Object.values(existingTokens)) {
    await db.delete('tokens', id);
  }
}

async function storeWebsite(website) {
  const existingWebsite = await db.find('websites', {identityId: identity.id, baseUrl: website.baseUrl});

  if (existingWebsite && website.id && existingWebsite.id !== website.id) {
    throw new AppError('Could not save website record', {websiteId: website.id, existingWebsiteId: existingWebsite.id});
  }

  if (website.id) {
    website.updatedAt = Date.now();
    await db.patch('websites', website);
  } else {
    website = await db.add('websites', website);
  }

  return website;
}

async function confirm(){
  if (busyRef.value) return;
  busyRef.value = true;

  try {
    // Remember user-selection of permissions in the website model
    for (const [k,v] of Object.entries(permissionSwitchesRef.value)) {
      website.permissions[k] = !!v;
    }

    website.lastLoginAt = Date.now();

    // The tile icon is captured under this approval, and only when there is none yet or the site now
    // names a different URL
    if (!website.manifest.iconUrl) {
      if (website.icon) {
        website.icon = null; // the site no longer names an icon (null, not delete: db.patch merges keys and cannot drop one)
      }
    } else if (!website.icon || website.icon.url !== website.manifest.iconUrl) {
      const icon = await captureIcon(website.manifest.iconUrl);
      if (icon) {
        website.icon = icon; // a failed capture keeps the previously captured icon, if any
      }
    }

    website = await storeWebsite(website);

    await clearTokens();

    const signedMetadata = {};

    if (requestedExt.privateProfile && permissionSwitchesRef.value.privateProfile) {
      signedMetadata.ext ||= {};
      signedMetadata.ext.privateProfile = sharedPrivateProfile();
    }

    for (const type of TOKEN_TYPES) {
      if (permissionSwitchesRef.value[type] || !!requestedExt[type]) {
        const value = ':' + Triauth.Helpers.randomString(24);

        signedMetadata.ext ||= {};
        signedMetadata.ext[type] = value;

        await db.add('tokens', {
          identityId: identity.id,
          websiteId: website.id,
          baseUrl: baseUrl.href,
          origin: baseUrl.origin,
          type,
          value,
          createdAt: Date.now()
        })
      }
    }

    const authenticator = new Authenticator(identity, identity.signers);
    const responseData = await authenticator.process('auth', baseUrl.href, challenge.challengeString, signedMetadata);

    Helpers.sendResponse(callbackMethod, callbackUrl, responseData);

  } catch (err) {
    Triauth.config.logger.error(err, err.data);
    stateRef.value = 'error';
    errorMessageRef.value = err instanceof AppError ? err.message : 'Internal error has occurred';
    busyRef.value = false;
  }
}

async function deny() {
  if (busyRef.value) return;
  busyRef.value = true;

  await clearTokens();

  stateRef.value = 'denied';

  if (Helpers.referrerMatchesCallback(callbackUrl)) {
    Helpers.sendResponse(callbackMethod, callbackUrl, 'false');

  }
}

</script>

<template>
  <div class="m-auto rounded-lg border border-gray-200 bg-white text-left shadow-md " style="margin-top:10vh;max-width:min(90vw,640px);width:min(90vw,640px);">
    <div :class="[stateRef === 'error' ? 'bg-red-600' : 'bg-blue-600']" class="p-5 text-white font-bold rounded-tl-lg rounded-tr-lg flex flex-row justify-between">
      <div class="w-6"><strong>⠕</strong></div>
      <div class="text-left flex-1">&nbsp;</div>
    </div>

    <div class="p-5 text-center" v-if="stateRef === 'verifying'">
      Verifying, please wait ...
    </div>

    <div class="p-5 flex flex-col gap-4 text-center" v-else-if="stateRef === 'error'">
      <div class="font-bold p-2">Authentication request could not be processed</div>
      <div class="text-sm p-2">{{errorMessageRef}}</div>
      <div class="p-2">You can close this tab or navigate back to the previous page</div>
    </div>

    <div class="p-5 text-center" v-else-if="stateRef === 'denied'">
      <div class="font-bold">Request has been denied</div>
      <div class="p-2">You can close this tab or navigate back to the previous page</div>
    </div>

    <div class="p-5 flex flex-col gap-4 text-center" v-else-if="stateRef === 'pending'">

      <div class="m-7 mb-1 my-4 pt-4 pb-2 p-6 text-center rounded-lg">
        <div class="font-bold py-2 text-lg break-all">
          {{baseUrl}}
        </div>
        <div class="text-sm py-2 text-slate-800 leading-relaxed">
          This website wants to authenticate you as
          <strong>{{ challenge.identity.identifier }}</strong>
        </div>
      </div>

      <div class="mx-7 p-2 text-left text-sm text-gray-500" v-if="grantsRef.length > 0">
        Approving will allow this website to:
        <ul class="list-disc ml-5 mt-1">
          <li v-for="grant of grantsRef" :key="grant.key">{{ grant.text }}</li>
        </ul>
      </div>

      <div class="mx-7 pt-4 p-6 text-left bg-gray-50 rounded-lg" v-if="requestedExt.privateProfile">
        <div class="font-bold py-2 flex">
          <label class="grow">Private profile</label>
          <div><ToggleSwitch v-model="permissionSwitchesRef.privateProfile"/></div>
        </div>
        <div class="text-sm py-2 text-slate-800">
          Allow this website to read your private profile.<br/>
          <span class="text-gray-500">{{ privateProfileFieldsRef }}</span>
        </div>
      </div>

      <div class="p-2 bg-yellow-200 inline-block rounded text-gray-800 text-sm" v-if="!website.id">
        You are signing in for the first time to this website from this device.
      </div>

      <div class="flex flex-col md:flex-row-reverse md:mx-4 gap-4 text-center justify-between mt-4">
        <Button @click="confirm" :disabled="inCoolOffPeriodRef || busyRef" class="md:w-1/2">Approve</Button>
        <Button @click="deny" variant="outlined" :disabled="busyRef" class="md:w-1/2">Deny</Button>
      </div>

    </div>
  </div>
</template>

<style scoped>
</style>

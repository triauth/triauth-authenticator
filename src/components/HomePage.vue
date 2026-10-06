<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import ContextMenu from 'primevue/contextmenu'
import Dialog from 'primevue/dialog'
import { useConfirm } from 'primevue/useconfirm';

import MoreVertIcon from '../../vendor/material-icons/MoreVert.vue';

import { db } from '../db/db.js'
import { Helpers } from '../lib/helpers.js'
import { confetti } from '../lib/confetti.js'
import { isAndroid, isStandalone, installAvailableRef, promptInstall } from '../lib/pwa.js'

const identifierRef = ref(null);
const identityRef = ref(null);
const identityIdRef = ref(null);

const identities = db.watch('identities', {identifier:identifierRef});

watch(identities, (newIdentities) => {
  identityRef.value = Object.values(newIdentities)[0];
  identityIdRef.value = identityRef.value?.id;
});

const onHashChange = () => {
  identifierRef.value = Helpers.hashPath(window.location).split('/')[0];
}
onHashChange();
onMounted(() => window.addEventListener('hashchange', onHashChange));
onUnmounted(() => window.removeEventListener('hashchange', onHashChange))

////
// Greet an identity created moments ago

const greetedIdRef = ref(null);
watch(identityRef, (identity) => {
  if (identity && Date.now() - identity.createdAt < 15_000) greetedIdRef.value = identity.id;
});

// Confetti burst triggered by animation end
const burst = (e) => {
  const r = e.target.getBoundingClientRect();
  confetti({x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight});
};

// Every website this identity has signed in to, in store order
const websites = db.watch('websites', {identityId:identityIdRef});
const websitesRef = computed(() => Object.values(websites));

const openWebsite = (website) => {
  const url = website.manifest?.startUrl || website.baseUrl;

  // When in Android PWA, use intent URLs to launch a proper web browser
  if (isAndroid() && isStandalone()) {
    const u = new URL(url);
    window.location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.slice(0, -1)};action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    return;
  }

  const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (newWindow) { newWindow.opener = null; } // just to stay extra-safe
}

////
// Context menu

const contextMenu = ref()
const lookupCodeVisible = ref(false);

const contextMenuItems = [
  { label: 'Show lookup code', visible: () => !!identityRef.value?.lookupCode, command: () => lookupCodeVisible.value = true },
  { label: 'Install app', visible: () => isAndroid() && !isStandalone() && installAvailableRef.value, command: () => promptInstall() },
  { label: 'All identities', command: () => window.location = '#index' }
]

const showContextMenu = (event) => {
  contextMenu.value.show(event);
}

const confirm = useConfirm();

// Forgetting a website drops its record and every token issued to it
const confirmForgetWebsite = (website) => {
  confirm.require({
    header: 'Forget this website?',
    message: `${website.manifest?.name || website.baseUrl} and its access tokens will be removed from this device. You may be signed out there, and your next sign-in will ask for your approval again.`,
    acceptProps: { label: 'Forget', severity: 'danger' },
    rejectProps: { label: 'Cancel', severity: 'secondary', variant: 'outlined' },
    accept: () => db.deleteWebsite(website.id)
  });
}

const websiteContextMenu = ref();
const websiteContextMenuSelectionRef = ref();
const websiteContextMenuItems = [
  { label: 'Forget this website', command: () => confirmForgetWebsite(websiteContextMenuSelectionRef.value) }
]

const showWebsiteContextMenu = (event, website) => {
  websiteContextMenuSelectionRef.value = website;
  websiteContextMenu.value.show(event);
}

function websiteIconInitials(website) {
  return String(website.manifest?.name || '').substring(0, 2);
}

// The icon captured at approval (AuthPage.vue)
function websiteIconSrc(website) {
  return website.icon?.dataUrl || null;
}

</script>

<template>
  <div v-if="identityRef">
    <Toolbar class="rounded-4xl min-w-[100vw]">
      <template #start>
        <a href="#index" class="size-6 text-xl text-center ml-2 cursor-pointer"><strong>⠕</strong></a>
      </template>

      <template #end>
        <div class="flex items-center gap-2">
          <div class="my-2 flex items-center mr-4">
            <Avatar :image="identityRef.privateProfile.avatarImage" :label="identityRef.privateProfile.avatarImage ? null : identityRef.privateProfile.initials || '&nbsp;'" size="large" shape="circle" :title="identityRef.privateProfile.initials" class="mr-4" v-if="identityRef.privateProfile.initials || identityRef.privateProfile.avatarImage"/>
            <div>
              <div class="text-left">{{identityRef.privateProfile.name || identityRef.identifier }}</div>
              <div class="text-sm text-gray-500" v-if="identityRef.privateProfile.name">{{identityRef.identifier || '&nbsp;'}}</div>
            </div>
            <div class="ml-4 size-6 cursor-pointer" @click.prevent="showContextMenu"><MoreVertIcon/></div>
          </div>
        </div>
      </template>
    </Toolbar>

    <div class="mt-5">
      <div
          v-for="website in websitesRef" :key="website.id"
          @click.prevent="openWebsite(website)"
          @contextmenu.prevent="showWebsiteContextMenu($event, website)"
          class="cursor-pointer select-none w-[112px] h-[112px] float-left m-5 border-0"
          draggable="true"
      >
        <div class="flex flex-col truncate" :title="website.manifest?.startUrl || website.baseUrl">
          <div class="text-center mb-2"><Avatar :image="websiteIconSrc(website)" :label="websiteIconSrc(website) ? null : websiteIconInitials(website)" size="large" shape="circle"/></div>
          <div class="text-sm font-medium truncate text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-full">{{website.manifest?.name}}</div>
          <div class="text-xs font-mono truncate">{{(website.manifest?.startUrl || website.baseUrl || '').replace(/^https?:\/\//, '')}}</div>
        </div>
      </div>

      <div v-if="greetedIdRef === identityRef.id && websitesRef.length === 0" class="pt-20 text-center">
        <h2 class="text-2xl font-bold ta-rise" style="--d:.15s" @animationend="burst">You're all set!</h2>
        <p class="pt-3 px-3 ta-rise" style="--d:.3s">{{ identityRef.whoisResponse ? 'You can now sign in to websites with this device.' : 'Once your DNS records are visible, you can sign in to websites with this device.' }}</p>
        <p class="text-sm pt-5 ta-rise" style="--d:.45s">Websites you sign in to will show up here.</p>
      </div>

      <div v-else-if="websitesRef.length === 0" class="pt-20 text-center">
        Nothing here yet
        <div class="text-sm pt-5">Websites you sign in to will show up here.</div>
      </div>
    </div>

    <ContextMenu ref="contextMenu" :model="contextMenuItems" />
    <ContextMenu ref="websiteContextMenu" :model="websiteContextMenuItems" />

    <Dialog v-if="identityRef.lookupCode" v-model:visible="lookupCodeVisible" modal header="Lookup code" :draggable="false" :style="{ width: 'min(90vw, 420px)' }">
      <pre class="text-center text-xl tracking-widest select-all bg-gray-100 rounded p-4">{{ Helpers.formatLookupCode(identityRef.lookupCode) }}</pre>
      <p class="text-sm text-gray-500 mt-4">You may need this code to set up {{ identityRef.identifier }} on another device. On its own it does not let anyone sign in as you.</p>
    </Dialog>
  </div>
  <div v-else>
    <div class="m-20">
      Identifier <strong>{{identifierRef}}</strong> is not configured on this device.<br/><br/>
      <Button variant="outlined" as="a" href="#setup">Go to setup</Button>
    </div>
  </div>
</template>

<style scoped>
/* Captured icons are square with transparent padding; keep them whole inside the round avatar */
:deep(.p-avatar img) {
  object-fit: contain;
}

@media (prefers-reduced-motion: no-preference) {
  .ta-rise {
    animation: ta-rise .4s ease-out both;
    animation-delay: var(--d, 0s);
  }
}

@keyframes ta-rise {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}
</style>

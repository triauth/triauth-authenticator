<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import ContextMenu from 'primevue/contextmenu'
import Dialog from 'primevue/dialog'
import Textarea from 'primevue/textarea'
import { useConfirm } from 'primevue/useconfirm';

import MoreVertIcon from '../../vendor/material-icons/MoreVert.vue';

import { db } from '../db/db.js'
import { Helpers } from '../lib/helpers.js'
import { confetti } from '../lib/confetti.js'
import { isAndroid, isStandalone, installAvailableRef, promptInstall } from '../lib/pwa.js'

// The list of websites and apps that support triauth, kept on the project site
const EVERYWHERE_URL = 'https://www.triauth.org/everywhere/';

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

// Forgetting a website drops its record, its session and its verifications
const confirmForgetWebsite = (website) => {
  confirm.require({
    header: 'Forget this website?',
    message: `${websiteName(website)} will be removed. You may be signed out there, and your next sign-in will ask for your approval again.`,
    acceptProps: { label: 'Forget', severity: 'danger' },
    rejectProps: { label: 'Cancel', severity: 'secondary', variant: 'outlined' },
    accept: () => db.deleteWebsite(website.id)
  });
}

const websiteContextMenu = ref();
const websiteContextMenuSelectionRef = ref();
const websiteHost = (website) => new URL(website.manifest?.startUrl || website.baseUrl).host;
const websiteContextMenuItems = [
  { label: () => 'Open ' + websiteHost(websiteContextMenuSelectionRef.value), command: () => openWebsite(websiteContextMenuSelectionRef.value) },
  { label: 'Rename', command: () => { renameValue.value = websiteContextMenuSelectionRef.value.name || ''; renameVisible.value = true; } },
  { label: 'Forget this website', command: () => confirmForgetWebsite(websiteContextMenuSelectionRef.value) }
]

// The user's own name for a tile, up to two lines; an empty name goes back to the website's own
const renameVisible = ref(false);
const renameValue = ref('');
const saveRename = async () => {
  const name = renameValue.value.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 2).join('\n');
  await db.patch('websites', {id: websiteContextMenuSelectionRef.value.id, name});
  renameVisible.value = false;
}

const websiteName = (website) => website.name || website.manifest?.name || website.baseUrl;
const websiteNameParts = (website) => websiteName(website).split(/(?<=\.)/);   // a host name wraps after a dot

const showWebsiteContextMenu = (event, website) => {
  websiteContextMenuSelectionRef.value = website;
  websiteContextMenu.value.show(event);
}

// Initials for a tile without an icon; a host name counts as one word
function websiteIconInitials(website) {
  const words = websiteName(website).split(/[^\p{L}\p{N}.]+/u).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
}

// A pastel plate per website for tiles without an icon, as on www.triauth.org
function websiteIconStyle(website) {
  if (websiteIconSrc(website)) return null;
  let hue = 0;
  for (const c of website.baseUrl) hue = (hue * 31 + c.charCodeAt(0)) >>> 0;
  return {background: `hsl(${hue % 360} 70% 93%)`, color: `hsl(${hue % 360} 55% 34%)`};
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
            <div class="text-left">{{ identityRef.identifier }}</div>
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
        <div class="flex flex-col" :title="website.manifest?.startUrl || website.baseUrl">
          <div class="text-center mb-2"><Avatar :image="websiteIconSrc(website)" :label="websiteIconSrc(website) ? null : websiteIconInitials(website)" :style="websiteIconStyle(website)" size="large"/></div>
          <div class="text-sm font-medium text-center line-clamp-2 whitespace-pre-line wrap-anywhere"><template v-for="(part, i) of websiteNameParts(website)" :key="i">{{ part }}<wbr/></template></div>
        </div>
      </div>

      <div v-if="greetedIdRef === identityRef.id && websitesRef.length === 0" class="pt-20 text-center">
        <h2 class="text-2xl font-bold ta-rise" style="--d:.15s" @animationend="burst">You're all set!</h2>
        <p class="pt-3 px-3 ta-rise" style="--d:.3s">{{ identityRef.whoisResponse ? 'You can now sign in to websites with this device.' : 'Once your DNS records are visible, you can sign in to websites with this device.' }}</p>
        <p class="text-sm pt-5 ta-rise" style="--d:.45s">Websites you sign in to will show up here.</p>
        <p class="text-sm pt-2 ta-rise" style="--d:.6s"><a :href="EVERYWHERE_URL" target="_blank" rel="noopener noreferrer" class="underline">See where you can use triauth</a>.</p>
      </div>

      <div v-else-if="websitesRef.length === 0" class="pt-20 text-center">
        Nothing here yet
        <div class="text-sm pt-5">Websites you sign in to will show up here.</div>
        <div class="text-sm pt-2">Looking for one? <a :href="EVERYWHERE_URL" target="_blank" rel="noopener noreferrer" class="underline">See where you can use triauth</a>.</div>
      </div>
    </div>

    <ContextMenu ref="contextMenu" :model="contextMenuItems" />
    <ContextMenu ref="websiteContextMenu" :model="websiteContextMenuItems" />

    <Dialog v-if="identityRef.lookupCode" v-model:visible="lookupCodeVisible" modal header="Lookup code" :draggable="false" :style="{ width: 'min(90vw, 420px)' }">
      <pre class="text-center text-xl tracking-widest select-all bg-gray-100 rounded p-4">{{ Helpers.formatLookupCode(identityRef.lookupCode) }}</pre>
      <p class="text-sm text-gray-500 mt-4">You may need this code to set up {{ identityRef.identifier }} on another device. On its own it does not let anyone sign in as you.</p>
    </Dialog>

    <Dialog v-model:visible="renameVisible" modal header="Rename" :draggable="false" :style="{ width: 'min(90vw, 420px)' }">
      <Textarea v-model="renameValue" :placeholder="websiteContextMenuSelectionRef?.manifest?.name" rows="2" maxlength="255" class="w-full" autofocus/>
      <template #footer>
        <Button label="Cancel" severity="secondary" variant="outlined" @click="renameVisible = false"/>
        <Button label="Save" @click="saveRename"/>
      </template>
    </Dialog>
  </div>
  <div v-else>
    <div class="m-20">
      Identifier <strong>{{identifierRef}}</strong> is not configured on this device.<br/><br/>
      <Button variant="outlined" as="a" :href="'#setup?identifier=' + encodeURIComponent(identifierRef)">Go to setup</Button>
    </div>
  </div>
</template>

<style scoped>
/* Tiles are rounded squares on one plate, like a phone's home screen icons; captured icons are square with transparent padding */
:deep(.p-avatar), :deep(.p-avatar img) {
  border-radius: 22%;
}
:deep(.p-avatar) {
  vertical-align: top;   /* the same label position under initials and under an image */
}
:deep(.p-avatar-image) {
  background: var(--p-avatar-background);
}
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

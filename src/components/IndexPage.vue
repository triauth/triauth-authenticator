<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<script setup>
import { ref } from 'vue';
import ContextMenu from 'primevue/contextmenu'

import BadgeIcon from '../../vendor/material-icons/Badge.vue';
import MoreVertIcon from '../../vendor/material-icons/MoreVert.vue';
import AddIcon from '../../vendor/material-icons/Add.vue';

import { db } from '../db/db.js'
import { useConfirm } from 'primevue/useconfirm';

const identities = db.watch('identities');

const confirm = useConfirm();

const contextMenu = ref()
const selectedIdentity = ref(null)

// Deleting an identity destroys this device's keys for it - never do it on a single tap.
const confirmDeleteIdentity = (identity) => {
  confirm.require({
    header: 'Delete this identity?',
    message: `${identity.identifier} and its cryptographic keys will be removed from this device.`,
    acceptProps: { label: 'Delete', severity: 'danger' },
    rejectProps: { label: 'Cancel', severity: 'secondary', variant: 'outlined' },
    accept: () => db.deleteIdentity(identity.id)
  });
}

const contextMenuItems = [
  { label: 'Delete', command: () => confirmDeleteIdentity(selectedIdentity.value) }
]

const showContextMenu = (event, identity) => {
  selectedIdentity.value = identity;
  contextMenu.value.show(event);
}

const redirectToHomeScreen = (identity) => {
  window.location = '#' + identity.identifier;
}

const authenticatorHost = window.location.hostname;

// Redirect to setup if no identites found
db.list('identities').then((ids) => {
  if(Object.keys(ids).length <= 0){
    window.location.hash = '#setup';
  }
});

</script>

<template>
  <div class="my-[10vw] md:my-[10vh] m-auto rounded-lg border border-gray-200 bg-white text-left shadow-md min-w-[320px] w-max max-w-[640px]">
    <div class="p-5 pl-5 pr-5 bg-blue-600 text-white font-bold rounded-tl-lg rounded-tr-lg flex flex-row justify-between select-none">
      <div class="size-5 text-l text-center"><strong>⠕</strong></div>
      <div class="flex-2 pr-5 pl-5 truncate">{{ authenticatorHost }}</div>
      <div class="size-5 text-center"><a href="#setup" class="text-white hover:bg-blue-500 inline-block rounded-xl p-1 -m-1"><AddIcon/></a></div>
    </div>

    <div v-for="identity of identities" :key="identity.id" class="p-5 pl-5 pr-5 border border-l-0 border-r-0 border-t-0 border-b-gray-200 flex hover:bg-gray-50 select-text cursor-pointer" @click.prevent="redirectToHomeScreen(identity)">
      <div class="size-5 text-center"><BadgeIcon/></div>
      <div class="flex-2 pr-5 pl-5 truncate">{{identity.identifier}}</div>
      <div class="size-5 cursor-pointer" @click.prevent="showContextMenu($event, identity)"><MoreVertIcon/></div>
    </div>

    <ContextMenu ref="contextMenu" :model="contextMenuItems" />
  </div>
</template>

<style scoped>
</style>

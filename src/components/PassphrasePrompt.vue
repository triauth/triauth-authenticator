<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import Dialog from 'primevue/dialog';
import { passphrasePromptState, registerPassphraseHost, _settlePassphrase } from '../lib/passphrasePrompt.js';

const state = passphrasePromptState;

const passphraseRef = ref('');
const confirmRef = ref('');
const showPass = ref(false);
const showConfirm = ref(false);

const isConfirm = computed(() => !!state.request?.confirm);
const minLength = computed(() => state.request?.minLength || 0);
const tooShort = computed(() => isConfirm.value && passphraseRef.value.length > 0 && passphraseRef.value.length < minLength.value);
const mismatch = computed(() => isConfirm.value && confirmRef.value.length > 0 && passphraseRef.value !== confirmRef.value);
const matched  = computed(() => isConfirm.value && confirmRef.value.length > 0 && passphraseRef.value === confirmRef.value);
const canSubmit = computed(() => {
  if (passphraseRef.value.length === 0) return false;
  if (isConfirm.value) return passphraseRef.value.length >= minLength.value && passphraseRef.value === confirmRef.value;
  return true; // unlock: any non-empty (length is only enforced when creating)
});

// One compact line under the fields: the hint of a failed previous attempt when the request
// carries one, otherwise (confirm/create mode) the validation status when relevant, otherwise
// the tip. Same font-size for all states so it stays small and the dialog height doesn't
// change. Priority: hint, length, then match.
const line = computed(() => {
  if (state.request?.error) return { color: 'text-red-600', text: state.request.error };
  if (!isConfirm.value) return null;
  if (tooShort.value) return { color: 'text-gray-500', text: `Use at least ${minLength.value} characters` };
  if (mismatch.value) return { color: 'text-red-600',  text: "Passphrases don't match" };
  if (matched.value)  return { color: 'text-green-600', text: 'Passphrases match' };
  return { color: 'text-gray-500', text: 'Tip: use 4+ random words' };
});

// The field is type="text" (so Chrome's password manager never offers to save it) and
// visually masked via -webkit-text-security; the eye toggles the mask.
function fieldStyle(show) {
  const base = { width: '100%', paddingRight: '2.5rem' };
  return show ? base : { ...base, '-webkit-text-security': 'disc' };
}

let unregister = null;
onMounted(() => { unregister = registerPassphraseHost(); });
onUnmounted(() => unregister?.());

// Reset on each new request (NOT on mismatch — keep what the user typed).
watch(() => state.request, () => {
  passphraseRef.value = '';
  confirmRef.value = '';
  showPass.value = false;
  showConfirm.value = false;
});

function submit() {
  if (!canSubmit.value) return;
  _settlePassphrase(passphraseRef.value);
}
function cancel() { _settlePassphrase(null); }
</script>

<template>
  <Dialog
    :visible="!!state.request"
    @update:visible="(v) => { if (!v) cancel(); }"
    modal
    :closable="false"
    :draggable="false"
    :header="state.request?.title || 'Passphrase'"
    :style="{ width: 'min(90vw, 420px)' }"
  >
    <div class="flex flex-col gap-3">
      <div class="pp-field">
        <InputText
          type="text"
          v-model="passphraseRef"
          :style="fieldStyle(showPass)"
          aria-label="Passphrase"
          placeholder="Passphrase"
          autofocus
          autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
          data-1p-ignore data-lpignore="true"
          @keydown.enter.prevent="submit"
        />
        <button type="button" class="pp-eye" @mousedown.prevent @click="showPass = !showPass"
          :aria-label="showPass ? 'Hide passphrase' : 'Show passphrase'" :aria-pressed="showPass">
          <svg v-if="!showPass" viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z"/></svg>
          <svg v-else viewBox="0 -960 960 960" aria-hidden="true"><path d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T667-500q0 20-4 37.5T651-428Zm128 126-58-56q38-29 67.5-63.5T880-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-7.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T280-500q0-11 1.5-21t4.5-21l-64-62Zm319 121Zm-151 75Z"/></svg>
        </button>
      </div>

      <div class="pp-field" v-if="isConfirm">
        <InputText
          type="text"
          v-model="confirmRef"
          :style="fieldStyle(showConfirm)"
          aria-label="Confirm passphrase"
          placeholder="Confirm passphrase"
          autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
          data-1p-ignore data-lpignore="true"
          @keydown.enter.prevent="submit"
        />
        <button type="button" class="pp-eye" @mousedown.prevent @click="showConfirm = !showConfirm"
          :aria-label="showConfirm ? 'Hide passphrase' : 'Show passphrase'" :aria-pressed="showConfirm">
          <svg v-if="!showConfirm" viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z"/></svg>
          <svg v-else viewBox="0 -960 960 960" aria-hidden="true"><path d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T667-500q0 20-4 37.5T651-428Zm128 126-58-56q38-29 67.5-63.5T880-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-7.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T280-500q0-11 1.5-21t4.5-21l-64-62Zm319 121Zm-151 75Z"/></svg>
        </button>
      </div>

      <!-- One compact line: the hint, the validation status, or the tip. -->
      <small v-if="line" class="pp-line" :class="line.color">{{ line.text }}</small>
    </div>
    <template #footer>
      <div class="flex gap-2 w-full">
        <Button label="Cancel" variant="outlined" class="flex-1" @click="cancel"/>
        <Button label="OK" :disabled="!canSubmit" class="flex-1" @click="submit"/>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.pp-field { position: relative; display: block; }
.pp-eye {
  position: absolute; right: .5rem; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.75rem; height: 1.75rem; padding: 0; margin: 0;
  border: 0; background: transparent; cursor: pointer; border-radius: 4px;
  color: var(--p-text-muted-color, #6b7280);
}
.pp-eye:hover { color: var(--p-text-color, #374151); }
.pp-eye svg { width: 1.15rem; height: 1.15rem; fill: currentColor; display: block; }
.pp-line { display: block; font-size: .8125rem; line-height: 1.2; }
</style>

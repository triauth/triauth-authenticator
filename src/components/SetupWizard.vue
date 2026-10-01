<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<template>

  <div class="p-20 pl-10 pr-10 pb-10 md:pl-20 md:pr-20 m-auto rounded-lg border border-gray-200 bg-white shadow relative container md:min-w-[720px] md:max-w-[720px] min-w-[80vw] max-w-[80vw]" style="margin-top:10vh;">
    <div style="position:absolute;top:0;left:0;">
      <a href="#" class="p-4 block">⠕</a>
    </div>

    <div style="position:absolute;top:0;right:0;">
      <a href="#" class="p-4 block" v-if="cancellable"><CloseIcon/></a>
    </div>
    <div v-if="step === 'identifier'">
      <div class="flex flex-col gap-3">
        <h2 class="text-xl font-bold text-left mb-8">Let's get you registered on this device</h2>
        <label for="identifier" class="text-left">Your Identifier</label>
        <InputText id="identifier" v-model="identifier" @input="validateIdentifier" @keydown.enter.prevent="submitField" @keydown.esc.prevent="close" aria-describedby="identifier-help" placeholder="e.g., john@example.com" autofocus/>
        <Message size="small" severity="secondary" variant="simple" class="text-left" v-if="!identifierError" id="identifier-help">
          <div v-if="!identifier">
            <p>You will use this identifier to sign in to websites through this web browser.</p>
          </div>
          <div v-else>
            <div>✓ Identifier has valid syntax</div>

            <div v-if="!whoisResponse">
              - please wait ...
            </div>
            <div v-else-if="whoisResponse.error">
              ✕ An error has occurred - {{whoisResponse.error.message}}
            </div>
            <div v-else-if="whoisResponse.status === -1">
              ✕ Domain is not configured for triauth

              <div class="_dns-hint mt-3 p-3 rounded-md border border-gray-200 bg-gray-50 leading-relaxed">
                <div class="flex">
                  <div>🛈&nbsp;&nbsp;</div>
                  <div>To enable it, whoever manages <strong>{{ identifierDomain }}</strong> needs to publish a single DNS&nbsp;TXT record that points to this authenticator:</div>
                </div>

                <pre class="_code _code-compact text-left"><span style="opacity:0.5;user-select:none;">{{ identifierDomain }} TXT </span>"<span class="_sel" :title="copyTitle" @click="selectFragment">triauth {{ endpointHost }} mode={{ hintMode }}</span>"</pre>

                <div class="flex items-center">
                  <label>Pick a domain mode:</label>&nbsp;&nbsp;<SelectButton v-model="hintMode" :options="modeOptions" optionLabel="label" optionValue="value" :allowEmpty="false" size="small" aria-label="Mode"/>
                  <span class="ml-auto text-gray-500" aria-live="polite" v-if="copied">✓ Copied to clipboard</span>
                </div>

                <div class="mt-2" v-if="hintMode === 'public'">
                  Identifiers are easy to look up: anyone who knows or guesses one can check that it is set up for triauth and see the public details attached to it, such as device names.
                  There is nothing extra to keep track of.
                </div>
                <div class="mt-2" v-else>
                  Identifiers stay hidden: nobody can easily enumerate identifiers under your domain or even tell that a given identifier is set up for triauth without its lookup code.
                </div>
              </div>
            </div>
            <div v-else-if="whoisResponse.originMismatch">
              ✕ Please use <a :href="whoisResponse.authenticationEndpoint.url" rel="noreferrer">{{whoisResponse.authenticationEndpoint.url}}</a>
            </div>
            <div v-else-if="whoisResponse.modeMismatch">
              ✕ This domain is configured with unsupported mode
            </div>
            <div v-else-if="isPrivate">
              ✓ Domain is configured for triauth<br/><br/>
              🛈 This domain runs in private mode. You will need a lookup code in the next step.
            </div>
            <div v-else-if="whoisResponse.status === 0">
              ✓ Domain is configured for triauth<br/><br/>
              🛈 You are configuring this identifier for the first time
            </div>
            <div v-else-if="whoisResponse.status === 1">
              ✓ Domain is configured for triauth<br/><br/>
              🛈 You have {{whoisResponse.devices.length}} device(s) already configured
            </div>
          </div>
        </Message>
        <Message size="small" severity="error" variant="simple" class="text-left" v-if="identifierError">{{identifierError}}</Message>

        <Button class="mt-10" :disabled="!(whoisResponse?.status >= 0) || whoisResponse?.originMismatch || whoisResponse?.modeMismatch" @click="next">Continue</Button>
        <Button variant="text" as="a" href="#" size="small" v-if="cancellable">cancel</Button>
        <Button v-for="entry of testIdentitiesRef" :key="entry.identifier" @click="addTestIdentity(entry)" variant="text" as="a">add test identity {{ entry.identifier }}</Button>
      </div>
    </div>

    <div v-if="step === 'lookupCode'">
      <div class="flex flex-col gap-3">
        <h2 class="text-xl font-bold text-left mb-8">Lookup code</h2>

        <Message size="small" severity="secondary" variant="simple" class="text-left mb-3">
          <strong>{{ identifierDomain }}</strong> stores identity records under names that can only be derived with a lookup code.
        </Message>

        <div class="flex items-center gap-3 text-left">
          <RadioButton v-model="lookupCodeSource" inputId="lookupCodeNew" value="new"/>
          <label for="lookupCodeNew">I'm setting up this identifier for the first time</label>
        </div>
        <div class="flex items-center gap-3 text-left">
          <RadioButton v-model="lookupCodeSource" inputId="lookupCodeExisting" value="existing"/>
          <label for="lookupCodeExisting">I already have a lookup code</label>
        </div>

        <template v-if="lookupCodeSource === 'new'">
          <pre class="_code _code-lookup" id="generatedLookupCode">{{ Helpers.formatLookupCode(newLookupCode) }}</pre>
          <Message size="small" :severity="codeWhoisResponse?.error ? 'error' : 'secondary'" variant="simple" class="text-left">
            <div v-if="codeWhoisResponse?.error">
              ✕ An error has occurred - {{ codeWhoisResponse.error.message }} <a href @click.prevent="lookupWithCode(lookupCode)">try again</a>
            </div>
            <div v-else-if="codeWhoisResponse && !codeWhoisResponse.identityDomain">
              ✕ No identity domain could be derived for {{ identifierDomain }} - check the domain's configuration
            </div>
            <div v-else>
              This is your lookup code. Write it down as you may need it to set up this identifier on other devices.
              This device keeps a copy that you can view later from the identity menu.
            </div>
          </Message>
        </template>

        <template v-else-if="lookupCodeSource === 'existing'">
          <InputMask id="lookupCode" v-model="lookupCodeInput" mask="****-****-****-****" placeholder="XXXX-XXXX-XXXX-XXXX" unmask :autoClear="false" class="uppercase" style="font-family:ui-monospace,monospace;" autocomplete="off" spellcheck="false" @keydown.enter.prevent="submitField" autofocus/>
          <Message size="small" :severity="(codeWhoisResponse?.error || codeWhoisResponse?.status === 0) ? 'error' : 'secondary'" variant="simple" class="text-left">
            <div v-if="!lookupCode">Enter the 16-character code you saved when you first set up this identifier.</div>
            <div v-else-if="!codeWhoisResponse">- please wait ...</div>
            <div v-else-if="codeWhoisResponse.error">✕ An error has occurred - {{ codeWhoisResponse.error.message }} <a href @click.prevent="lookupWithCode(lookupCode)">try again</a></div>
            <div v-else-if="codeWhoisResponse.status === 1">✓ Lookup code accepted - you have {{ codeWhoisResponse.devices.length }} device(s) already configured</div>
            <div v-else>✕ No identity records were found for this code. Check it for typos, or choose the first option if you are setting up this identifier for the first time.</div>
          </Message>
        </template>

        <Button class="mt-10" :disabled="!lookupCodeAccepted" @click="next">{{ lookupCodeSource === 'new' ? 'I have saved my lookup code' : 'Continue' }}</Button>
        <Button @click="prev" variant="text" size="small">&laquo; go back</Button>
      </div>
    </div>

    <div v-if="step === 'device'">
      <div class="flex flex-col gap-3">
        <h2 class="text-xl font-bold text-left mb-10">Name this device</h2>

        <label for="deviceName" class="text-left">Device name</label>
        <InputText id="deviceName" v-model="deviceName" @input="validateDeviceName" @keydown.enter.prevent="submitField" aria-describedby="deviceName-help" placeholder="e.g., laptop" autofocus />
        <Message size="small" :severity="(deviceNameError || deviceNameExists) ? 'error' : 'secondary'" variant="simple" class="text-left" id="deviceName-help">
          <div v-if="deviceNameError">
            ✕ {{deviceNameError}}
          </div>
          <div v-else-if="!deviceName">
            How would you like to call this device?<br/>
            This name will be publicly visible in your identity records.
          </div>
          <div v-else-if="deviceNameExists">
            ✕ A device with this name already exists
          </div>
          <div v-else>
            ✓ That's a good name
          </div>
        </Message>

        <Button @click="next" :disabled="(!deviceName || deviceNameError || deviceNameExists)" class="mt-10">Next</Button>
        <Button @click="prev" variant="text" size="small">&laquo; go back</Button>
      </div>
    </div>

    <div v-if="step === 'factors'">
      <div class="flex flex-col gap-3">
        <h2 class="text-xl font-bold text-left ">Authentication factors</h2>
        <Message size="small" severity="secondary" variant="simple" class="text-left mb-5">
          Configure additional authentication factors to strengthen security.
          <br/><br/>
          Triauth supports all three factor types — something you know, something you have, and something you are — so you can combine them for maximum protection.
        </Message>

        <TransitionGroup name="slide" tag="div">
          <div v-for="(signer, index) in signers" :key="index" class="border-1 border-gray-200 rounded p-5 text-left flex mb-5">
            <div>
              <SecurityKeyIcon v-if="signer.icon === 'SecurityKey'"/>
              <PasswordIcon v-else-if="signer.icon === 'Password'"/>
              <KeyIcon v-else/>
            </div>
            <div class="ml-4 grow">
              {{signer.t.title}}
              <div class="mt-3">
                <Tag v-if="signer.factor" severity="secondary" class="mr-2">Something that you {{ signer.factor }}</Tag>
                <Tag severity="secondary" v-if="signer == signers[0]">Default</Tag>
              </div>
            </div>
            <a href @click.prevent="signers = signers.filter((s) => s !== signer)" class="" v-if="signers.length > 1 && signer !== signers[0]"><CloseIcon/></a>
          </div>
          <div :key="'z'" class="text-right">
            <Button variant="text" @click.prevent="showAuthenticationMethodsMenu($event)" :disabled="signers.length >= triauthLimits.maxKeysPerDevice">+ add another</Button>
          </div>
        </TransitionGroup>

        <Button @click="next" :disabled="(!deviceName || deviceNameError || deviceNameExists)" class="mt-10" autofocus>Next</Button>
        <Button @click="prev" variant="text" size="small">&laquo; go back</Button>
      </div>
      <ContextMenu ref="authenticationMethodsMenu" :model="authenticationMethodsMenuItems" />
    </div>

    <div v-if="step === 'publicProfile'">
      <div class="flex flex-col gap-3">
        <h2 class="text-xl font-bold text-left">Setup your public profile <sup>*</sup></h2>

        <Message size="small" severity="secondary" variant="simple" class="text-left mb-8">
          You can associate certain public details with your identifier.
          They will be visible to everyone who knows or guesses your identifier.
        </Message>

        <div class="mb-2 text-center">
          <Avatar :label="publicProfile.initials || '&nbsp;'" class="mr-2" size="large" shape="circle" />
          <div class="m-4 mt-2 mb-0 mr-6">{{publicProfile.name || '&nbsp;'}}</div>
        </div>

        <InputText v-model="publicProfile.initials" placeholder="Your initials" maxlength="2" @keydown.enter.prevent="submitField" :autofocus="!publicProfile.initials"/>
        <InputText v-model="publicProfile.name" placeholder="Your name or nickname" maxlength="25" @keydown.enter.prevent="submitField"/>

        <Button @click="next" :disabled="!!publicProfileError" class="mt-10" :autofocus="!!publicProfile.initials">{{ (publicProfile.initials || publicProfile.name) ? 'Next' : 'Skip' }}</Button>
        <Button @click="prev" variant="text" size="small">&laquo; go back</Button>
      </div>
    </div>

    <div v-if="step === 'privateProfile'">
      <div class="flex flex-col gap-3">
        <h2 class="text-xl font-bold text-left">Setup your private profile <sup>*</sup></h2>

        <Message size="small" severity="secondary" variant="simple" class="text-left mb-8">
          Your private profile will be stored on this device.
          Websites that you log into may ask for a permission to read your private profile,
          and you can decide on a case-by-case basis if you want to share it with them.
        </Message>

        <div class="mb-2 text-center">
          <Avatar :label="privateProfile.initials || '&nbsp;'" class="mr-2" size="large" shape="circle" :title="privateProfile.initials"/>
          <div class="m-4 mt-2 mb-0 mr-6">{{privateProfile.name || '&nbsp;'}}</div>
          <div class="m-4 mt-0 mr-6 text-sm text-gray-500">{{privateProfile.email || '&nbsp;'}}</div>
        </div>

        <InputText v-model="privateProfile.initials" :invalid="privateProfileErrors.initials" placeholder="Your initials" maxlength="2" @keydown.enter.prevent="submitField" :autofocus="!privateProfile.initials"/>
        <InputText v-model="privateProfile.name" :invalid="privateProfileErrors.name" placeholder="Name" maxlength="100" @keydown.enter.prevent="submitField"/>
        <InputText v-model="privateProfile.email" :invalid="privateProfileErrors.email" placeholder="Email address" maxlength="100" @keydown.enter.prevent="submitField"/>

        <Button @click="next" :disabled="privateProfileErrors.any" class="mt-10" :autofocus="!!privateProfile.initials">{{ (privateProfile.initials || privateProfile.name || privateProfile.email) ? 'Next' : 'Skip' }}</Button>
        <Button @click="prev" variant="text" size="small">&laquo; go back</Button>
      </div>
    </div>

    <div v-if="step === 'dns'">
      <div class="flex flex-col gap-3">
        <h2 class="text-xl font-bold text-left mb-10">Almost there</h2>

        <p class="text-left leading-relaxed">
          Please sign in to the administration panel of
          <strong><span class="_sel" :title="copyTitle" @click="selectFragment">{{identityDomainParts.parent}}</span></strong>
          domain
          <span v-for="[k, lines] of Object.entries(dnsRecords())" :key="k">
            <span v-if="lines.length">
              <span v-if="k === 'toRemove'"><br/><br/>remove the following existing DNS TXT record(s) for the <strong><span class="_sel" :title="copyTitle" @click="selectFragment">{{identityDomainParts.prefix}}</span><span style="opacity:0.7;">{{identityDomainParts.suffix}}</span></strong> subdomain:</span>
              <span v-if="k === 'toAdd'">and add the following DNS TXT record(s) for the <strong><span class="_sel" :title="copyTitle" @click="selectFragment">{{identityDomainParts.prefix}}</span><span style="opacity:0.7;">{{identityDomainParts.suffix}}</span></strong> subdomain:</span>
              <pre class="_code text-left"><span v-for="(rec, i) of lines" :key="i" style="display:block;"><span style="opacity:0.5;"><span class="_sel" :title="copyTitle" @click="selectFragment">{{ identityDomainParts.prefix }}</span>{{ identityDomainParts.suffix }} TXT </span>"<span class="_sel" :title="copyTitle" @click="selectFragment">{{ rec }}</span>"</span></pre>
              <span v-if="k === 'toAdd' && identityWhois?.identityDomain" class="block text-right -mt-6">
                <span class="text-sm text-gray-500 mr-3" aria-live="polite" v-if="copied">✓ Copied to clipboard</span>
                <Button @click="exportZoneFile" variant="text" size="small">Export to Zone File</Button>
              </span>
            </span>
          </span>
        </p>

        <Message size="small" severity="secondary" variant="simple" class="text-left" v-if="isPrivate">
          🛈 The subdomain name is derived from your identifier and your lookup code.
        </Message>

        <Message size="small" :severity="!dnsRecordsVerified ? 'error' : 'secondary'" variant="simple" class="text-left" v-if="dnsRecordsVerified !== undefined && dnsRecordsVerified !== null">
          <div v-if="!dnsRecordsVerified">
            ✕ TXT records are not visible yet, propagation may take several minutes
          </div>
          <div v-else>
            ✓ All looks good
          </div>
        </Message>

        <Message size="small" severity="error" variant="simple" class="text-left" v-if="setupErrorRef">✕ {{ setupErrorRef }}</Message>


        <Button disabled class="mt-10" v-if="dnsRecordsVerified === null">Verifying, please wait...</Button>
        <Button @click="verifyDnsRecords" class="mt-10" v-else-if="!dnsRecordsVerified" autofocus>Verify now</Button>
        <Button @click="finishSetup" class="mt-10" v-else>Finish setup</Button>

        <Button @click="finishSetup" variant="text" size="small">skip verification</Button>
        <Button @click="prev" variant="text" size="small">&laquo; go back</Button>
      </div>
    </div>


  </div>

</template>

<script setup>
import {ref, computed, watch, nextTick, shallowRef, reactive, onMounted, onUnmounted, toRaw} from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { db } from '../db/db.js'
import { Helpers } from '../lib/helpers.js'

import CloseIcon from '../../vendor/material-icons/Close.vue';
import KeyIcon from '../../vendor/material-icons/Key.vue';
import PasswordIcon from '../../vendor/material-icons/Password.vue';
import SecurityKeyIcon from '../../vendor/material-icons/SecurityKey.vue';

import ContextMenu from "primevue/contextmenu";
import RadioButton from "primevue/radiobutton";
import SelectButton from "primevue/selectbutton";

import DefaultSigner from '../signers/default.js';
import PassphraseSigner from "../signers/passphrase.js";
import WebauthnSigner from "../signers/webauthn.js";

import {clearBannerDismissal} from "../lib/pwa.js";

const STEPS = ['identifier', 'lookupCode', 'device', 'factors', 'publicProfile', 'privateProfile', 'dns'];
const step = ref(STEPS[0]);

const cancellable = ref(false);
db.list('identities').then((ids) => {
  cancellable.value = Object.keys(ids).length > 0;
});

// Developer convenience: identities listed in the gitignored .private/test-identities.json get a one-click
// "add test identity" link below the form. The whole branch is dropped from production builds.
const testIdentitiesRef = ref([]);
if (import.meta.env.DEV) {
  // A glob rather than a plain import, so that a missing file is an empty match and not a resolve error
  const [loadTestIdentities] = Object.values(import.meta.glob('../../.private/test-identities.json', {import: 'default'}));
  if (loadTestIdentities) {
    Promise.all([loadTestIdentities(), db.list('identities')]).then(([data, configured]) => {
      const taken = Object.values(configured).map((i) => i.identifier);
      testIdentitiesRef.value = data.identities.filter((t) => !taken.includes(t.identifier));
    });
  }
}

// Tries to focus the DOM element marked with 'autofocus' attribute
const autofocus = async () => {
  await nextTick();
  document.querySelector('[autofocus]')?.focus();
}
autofocus();

// Bound to keydown.enter on form fields -
// either moves the focus to the next field, or attempts to click the 'Next' button
const submitField = (e) => {
  const {srcElement} = e;

  let currentElement = srcElement;
  const tagNames = ['BUTTON', 'INPUT'];

  while (currentElement = currentElement.nextSibling) {
    if (tagNames.indexOf(currentElement.tagName) >= 0 && currentElement.checkVisibility()) {
      currentElement.focus(e);
      return currentElement.click(e);
    }
  }
};

// The lookup-code step exists only for private-mode domains, decided at each transition
const go = (dir) => {
  let i = STEPS.indexOf(step.value) + dir;
  if (STEPS[i] === 'lookupCode' && !isPrivate.value) i += dir;
  step.value = STEPS[i];
  autofocus();
};
const next = () => go(1);
const prev = () => go(-1);

const close = () => {
  window.location.href = '#';
};

// Show the unsaved changes warning when user attempts to reload the page while the wizard is active
const handleBeforeUnload = (event) => {
  event.preventDefault();
  event.returnValue = '';
};

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
});

// the default triauth configuration used here
// - limited to single resolver so it's faster and NXDOMAINs do not pollute caches of other resolvers
const triauthConfig = {resolver: new Triauth.Resolvers.Cloudflare()}

////////////
// Step - identifier

const identifier = ref('');
const identifierError = ref(null);
const whoisResponse = ref(null);
const isPrivate = computed(() => whoisResponse.value?.authenticationEndpoint?.options?.mode === 'private');

// Domain part of the identifier (e.g. 'example.com' for 'john@example.com') and the hostname of
// this authenticator — used to show the DNS setup hint when a domain isn't configured for triauth.
const identifierDomain = computed(() => identifier.value.split('@')[1] || '');
const endpointHost = window.location.hostname;

// Mode previewed in the DNS hint. Private is preselected.
const modeOptions = [{label: 'public mode', value: 'public'}, {label: 'private mode', value: 'private'}];
const hintMode = ref('private');

const validateIdentifier = async () => {
  identifierError.value = Triauth.validate({identifier:identifier.value}, triauthConfig).errors[0]?.message;

  const configuredIdentifiers = await db.list('identities');
  if (
      !identifierError.value &&
      Object.values(configuredIdentifiers).map((ci) => ci.identifier).indexOf(identifier.value) >= 0
  ) {
    identifierError.value = 'Identifier is already configured on this device';
  }

  whoisResponse.value = null;
  whoisIdentifier();
}

const whoisIdentifier = useDebounceFn(async () => {
  whoisResponse.value = null;

  if(!identifierError.value) {
    const currentIdentifier =  identifier.value;
    const currentWhoisResponse = await Triauth.whois({identifier: identifier.value}, triauthConfig);

    if (currentIdentifier === identifier.value) {
      whoisResponse.value = currentWhoisResponse;

      if (currentWhoisResponse.status >= 0) {
        whoisResponse.value.originMismatch = window.location.hostname !== 'localhost' && new URL(currentWhoisResponse.authenticationEndpoint.url).origin !== window.location.origin;
        whoisResponse.value.modeMismatch = ['public', 'private'].indexOf(currentWhoisResponse.authenticationEndpoint.options.mode) < 0
      }
    }
  }
}, 750);

// If identifier is set at setup (e.g., passed as a parameter), start validation manually
if (identifier.value) { validateIdentifier(); }

////////////
// Step - lookup code (private-mode domains only)

const lookupCodeSource = ref(null);   // 'new' | 'existing'
const newLookupCode = Helpers.generateLookupCode();
const lookupCodeInput = ref('');
const codeWhoisResponse = ref(null);  // whois with the code; null while pending

// The complete, valid code for the chosen source, else ''
const lookupCode = computed(() => {
  const code = lookupCodeSource.value === 'new' ? newLookupCode : (lookupCodeInput.value || '').toUpperCase();
  return lookupCodeSource.value && Triauth.Helpers.isLookupCode(code) ? code : '';
});

const whoisOptions = () => ({identifier: identifier.value, ...(lookupCode.value ? {lookupCode: lookupCode.value} : {})});

// Under a private-mode domain only the code-aware lookup describes the identity; later steps read this
const identityWhois = computed(() => codeWhoisResponse.value || whoisResponse.value);

// 'existing' needs bound records (status 1); 'new' only needs a derivable domain (status 0)
const lookupCodeAccepted = computed(() =>
  !!codeWhoisResponse.value?.identityDomain &&
  codeWhoisResponse.value.status >= (lookupCodeSource.value === 'existing' ? 1 : 0)
);

const lookupWithCode = async (code) => {
  codeWhoisResponse.value = null;
  if (!code) return;

  const currentIdentifier = identifier.value;
  const response = await Triauth.whois({identifier: currentIdentifier, lookupCode: code}, triauthConfig);

  // A first-time setup publishes a commitment over the untruncated label (PROTOCOL.md §6.9)
  if (response.status === 0 && response.identityDomain) {
    const {fullLabel} = await Triauth.IdentityDomain.derive(currentIdentifier, {...response.authenticationEndpoint.options, lookupCode: code});
    response.commitment = await Triauth.Helpers.sha256(fullLabel);
  }

  if (code === lookupCode.value && currentIdentifier === identifier.value) {
    codeWhoisResponse.value = response;
  }
};

watch(lookupCode, lookupWithCode);
watch(lookupCodeSource, autofocus);
watch(identifier, () => { lookupCodeSource.value = null; lookupCodeInput.value = ''; });

////////////
// Step - device name

const deviceName = ref('');
const deviceNameError = ref(null);
const deviceNameExists = ref(false);

watch([deviceName, identityWhois], () => {
  deviceNameExists.value = (identityWhois.value?.devices || []).map( (d) => d.deviceName ).indexOf(deviceName.value) >= 0;
})

const validateDeviceName = () => {
  deviceNameError.value = Triauth.validate({deviceName:deviceName.value}, triauthConfig).errors[0]?.message;
}

////////////
// Step - authentication factors

const triauthLimits = Triauth.LIMITS;

const signers = shallowRef([]);
new DefaultSigner().setup().then((signer) => signers.value = [...signers.value, signer]);

const deviceCapabilities = ref({});

const detectDeviceCapabilities = async () => {
  const hasWebAuthn = window.PublicKeyCredential !== undefined;
  const hasPlatformAuth = hasWebAuthn &&  await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  const hasConditionalAuth = hasWebAuthn && await PublicKeyCredential.isConditionalMediationAvailable();

  deviceCapabilities.value = {hasWebAuthn, hasPlatformAuth, hasConditionalAuth}
}
detectDeviceCapabilities();

const authenticationMethodsMenu = ref();

const authenticationMethodsMenuItems = ref([
  { label: 'Browser-based cryptographic key', command: () => new DefaultSigner().setup().then((signer) => signers.value = [...signers.value, signer]) },
  { label: 'Passphrase-protected cryptographic key', command: () => new PassphraseSigner().setup().then((signer) => signers.value = [...signers.value, signer]) },
  { label: 'Biometrics, security keys, and others...', command: () => new WebauthnSigner().setup({identifier:identifier.value}).then((signer) => signers.value = [...signers.value, signer]) },
]);

const showAuthenticationMethodsMenu = (event) => {
  authenticationMethodsMenu.value.show(event);
}


////////////
// Step - public profile

const publicProfile = reactive({name:'', initials:''});
const publicProfileError = ref(null);

watch(identityWhois, () => {
  publicProfile.initials ||= identityWhois.value?.publicProfile?.initials || '';
  publicProfile.name ||= identityWhois.value?.publicProfile?.name || '';
});

watch(publicProfile, () => {
  const initialsError = publicProfile.initials && (!Triauth.Helpers.isNormalString(publicProfile.initials) || publicProfile.initials.match(/['"=<>&]/) || publicProfile.initials.length > 2);
  const nameError = publicProfile.name && (!Triauth.Helpers.isNormalString(publicProfile.name) || publicProfile.name.match(/["=<>&]/) || publicProfile.name.length > 25);
  publicProfileError.value = nameError || initialsError;
})


////////////
// Step - private profile

const privateProfile = reactive({initials:'', name:'', email:''});
const privateProfileErrors = ref({});

watch(privateProfile, () => {
  privateProfileErrors.value = {
    initials: !!(privateProfile.initials && (!Triauth.Helpers.isNormalString(privateProfile.initials) || privateProfile.initials.match(/['"=<>&]/) || privateProfile.initials.length > 2)),
    name: !!(privateProfile.name && (!Triauth.Helpers.isNormalString(privateProfile.name) || privateProfile.name.match(/["=<>&]/) || privateProfile.name.length > 25)),
    email: !!(privateProfile.email && (!Triauth.Helpers.isNormalString(privateProfile.email) || !privateProfile.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) || privateProfile.email.length > 250)),
  }
  privateProfileErrors.value.any = Object.values(privateProfileErrors.value).some((e) => e);
})

////////////
// Step - DNS setup

// identityDomain is '<label>._at.<parent-domain>'. Deriving the parent by counting
// labels breaks on multi-label registrable domains (e.g. example.co.uk), so split on
// the protocol's fixed '._at.' separator instead.
const identityDomainParts = computed(() => {
  const domain = identityWhois.value?.identityDomain || '';
  const at = domain.indexOf('._at.');
  if (at === -1) return {prefix: domain, parent: domain, suffix: ''};
  return {prefix: domain.slice(0, at + 4), parent: domain.slice(at + 5), suffix: domain.slice(at + 4)};
});

// Clicking a fragment selects it whole and copies it, so it can go straight into a DNS panel.
const copied = ref(false);
let copiedTimer;
const copyTitle = computed(() => copied.value ? 'Copied' : 'Copy to clipboard');

const selectFragment = async (event) => {
  const el = event.currentTarget;
  window.getSelection()?.selectAllChildren(el);

  try { await navigator.clipboard.writeText(el.textContent); } catch { return; }

  copied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { copied.value = false; }, 1500);
};

const dnsRecords = function(){
  const entries = { toRemove:[], toAdd:[] };

  // A first-time private-mode setup binds the records to the lookup code
  if (identityWhois.value?.commitment) {
    entries.toAdd.push(`commit ${identityWhois.value.commitment}`);
  }

  // Public profile entries
  const publicProfileKeys = ['initials', 'name'];
  for (const k of publicProfileKeys) {
    const existingValue = identityWhois.value?.publicProfile?.[k];
    const newValue = publicProfile[k];

    if (existingValue !== newValue) {

      if (existingValue) {
        entries.toRemove.push(`${k} ${encodeURIComponent(existingValue).replaceAll('%20', ' ')}`);
      }

      if (newValue) {
        entries.toAdd.push(`${k} ${encodeURIComponent(newValue).replaceAll('%20', ' ')}`);
      }

    }
  }

  // Keys
  for (const [idx, signer] of Object.entries(signers.value)) {
    const publishableKeyOptions = Object.entries(signer.publishableKeyOptions()).map(([k,v]) => `${k}=${v}` ).join(' ');
    entries.toAdd.push(`key ${deviceName.value}[${parseInt(idx, 10) + 1}/${ signers.value.length }]:${signer.publishableKey} ${publishableKeyOptions}`);
  }

  return entries;
}

// Support for "export to txt file" with the records as a BIND zone file (RFC 1035).
const ZONE_FILE_TTL = 15 * 60;

const zoneFile = () => {
  const {toRemove, toAdd} = dnsRecords();

  const fqdn = identityWhois.value.identityDomain;
  const lookupCodeInfo = lookupCode.value ? ` (${Helpers.formatLookupCode(lookupCode.value)})` : '';
  const lineComment = lookupCode.value ? `; ${identityWhois.value.identifier}${lookupCodeInfo}` : '';

  const line = (rec) => `${fqdn}. ${ZONE_FILE_TTL} IN TXT "${rec}"`;

  // Records are padded to a common width so that their comments line up. A run of spaces
  // separates items in a master file the same way a single one does (RFC 1035, section 5.1).
  const linesFor = (recs) => {
    const records = recs.map(line);
    const width = Math.max(...records.map((r) => r.length));
    return records.map((r) => lineComment ? `${r.padEnd(width)} ${lineComment}` : r);
  };

  const lines = [
    `; This is a DNS zone file in a BIND compatible format containing`,
    `; triauth records for ${identityWhois.value.identifier}${lookupCodeInfo}`,
    `; Import this file in your DNS provider's control panel, or add the records by hand.`,
  ];

  // A zone file cannot express a deletion
  if (toRemove.length) {
    lines.push(
      ';',
      '; WARNING:',
      ';  THESE EXISTING RECORD(S) HAVE TO BE FIRST MANUALLY REMOVED:',
      ...linesFor(toRemove).map((l) => `;   ${l}`)
    );
  }

  return [...lines, '', ...linesFor(toAdd), ''].join('\n');
};

const exportZoneFile = () => {
  const url = URL.createObjectURL(new Blob([zoneFile()], {type: 'text/plain;charset=utf-8'}));
  const link = Object.assign(
    document.createElement('a'),
    {href: url, download: `triauth-${identityWhois.value.identityDomain}.txt`}
  );

  document.body.appendChild(link);
  link.click();
  link.remove();

  // The file is rebuilt on every click, so release the URL once the browser has taken its copy
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const dnsRecordsVerified = ref(undefined);
const verifiedWhoisResponse = ref(null);

// Whatever changes what this step publishes invalidates an earlier verification
watch([identifier, lookupCode], () => {
  dnsRecordsVerified.value = undefined;
  verifiedWhoisResponse.value = null;
});

const verifyDnsRecords = async () => {
  dnsRecordsVerified.value = null;

  const currentWhoisResponse = await Triauth.whois(whoisOptions(), triauthConfig);

  let verified = false;
  if (currentWhoisResponse?.status > 0) {
    for (const dev of currentWhoisResponse.devices) {
      if (dev.deviceName !== deviceName.value || dev.keys.length !== signers.value.length) {
        continue;
      }

      const allKeysMatch = signers.value.every((signer, i) =>
        signer.publishableKey === dev.keys[i].value &&
        Object.entries(signer.publishableKeyOptions()).every(([k, v]) => dev.keys[i].options?.[k] === v)
      );

      if (allKeysMatch) {
        verified = true;
        break;
      }
    }
  }
  dnsRecordsVerified.value = verified;
  verifiedWhoisResponse.value = verified ? currentWhoisResponse : null;

  // Autofocus on the 'Verify' button, so that subsequent enter key presses re-verify
  autofocus();
}

////////////
// Finish setup

const setupErrorRef = ref(null);

const finishSetup = async () => {
  setupErrorRef.value = null;

  let identityData = {
    identifier: identifier.value,
    signers: signers.value.map((signer) => signer.serialize()),
    publicProfile: toRaw(publicProfile),
    privateProfile: toRaw(privateProfile),
    createdAt: Date.now()
  }

  if (lookupCode.value) {
    identityData.lookupCode = lookupCode.value;
  }

  // A confirmed lookup that includes this device; its presence tells the home page the setup was verified
  if (verifiedWhoisResponse.value) {
    identityData.whoisResponse = verifiedWhoisResponse.value;
    identityData.whoisResponseUpdatedAt = Date.now();
  }

  // db.validate errors are plain strings (see db._validateObjectSchema)
  let validationResult = db.validate('identities', identityData);
  if (!validationResult.valid) {
    Triauth.config.logger.error('Identity validation failed', {errors: validationResult.errors, identityData});
    setupErrorRef.value = 'This identity could not be saved: ' + validationResult.errors.join(' ');
    return;
  }

  try {
    await db.add('identities', identityData);
  } catch (err) {
    // e.g. ConstraintError from the unique identifier index, when another tab
    // registered the same identifier in the meantime
    Triauth.config.logger.error('Could not store the identity', err);
    setupErrorRef.value = 'This identity could not be saved. If it is already registered on this device, go back and pick a different identifier.';
    return;
  }

  // Fresh keys renew the stakes - a previously snoozed durability nudge should reappear.
  clearBannerDismissal();

  window.location.hash = '#' + identifier.value;
}


// Adds one entry of .private/test-identities.json: an identity whose browser keys are given as JWKs
const addTestIdentity = async (entry) => {
  const algorithm = {name: 'ECDSA', namedCurve: 'P-256'};
  const signers = [];

  for (const {jwk} of entry.signers) {
    const {d, ...publicJwk} = jwk;
    const signer = new DefaultSigner();
    signer.data = {
      privateKey: await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['sign']),
      publicKey: await crypto.subtle.importKey('jwk', publicJwk, algorithm, true, ['verify'])
    };
    signer.publishableKey = Triauth.Helpers.arrayBufferToBase64Url(await crypto.subtle.exportKey('raw', signer.data.publicKey));
    signers.push(signer.serialize());
  }

  await db.add('identities', {
    identifier: entry.identifier,
    ...(entry.lookupCode ? {lookupCode: entry.lookupCode} : {}),
    publicProfile: entry.publicProfile || {},
    privateProfile: entry.privateProfile || {},
    signers,
    createdAt: Date.now()
  });

  window.location.hash = '#' + entry.identifier;
};

</script>

<style scoped>
._code { display:block; margin:2rem 0; padding:2rem 1.5rem; overflow-x:scroll; background:#333; color:white; border-radius:0.25rem; }

/* Compact code block used inline inside hints (e.g. the DNS setup hint) */
._code._code-compact { margin:1rem 0; padding:0.625rem 0.875rem; overflow-x:auto; }

/* Generated lookup code, shown once for the user to save */
._code._code-lookup { margin:0.5rem 0; text-align:center; font-size:1.25rem; letter-spacing:0.15em; user-select:all; }

/* Code and prose fragments that a click selects whole, for pasting into a DNS panel */
._sel { cursor:copy; border-radius:0.15rem; }
._sel:hover { background:color-mix(in srgb, currentColor 15%, transparent); }

.slide-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.slide-leave-to {
  opacity: 0;
  max-height: 0;
  margin: 0;
  padding: 0;
}

.slide-leave-from {
  max-height: 50px;
}

.slide-move {
  transition: transform 0.3s ease;
}

.p-tag-secondary {
  font-weight:normal
}

</style>

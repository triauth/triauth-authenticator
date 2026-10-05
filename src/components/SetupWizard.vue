<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<template>

  <div class="pt-12 md:pt-20 pl-10 pr-10 pb-10 md:pl-20 md:pr-20 my-[10vw] md:my-[10vh] m-auto rounded-lg border border-gray-200 bg-white shadow relative container md:min-w-[720px] md:max-w-[720px] min-w-[80vw] max-w-[80vw]">
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
        <InputText id="identifier" v-model="identifier" @input="validateIdentifier" @keydown.enter.prevent="submitField" @keydown.esc.prevent="close" aria-describedby="identifier-help" placeholder="e.g., john@example.com" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" autofocus/>
        <Message size="small" severity="secondary" variant="simple" class="text-left min-w-0" :pt="{contentWrapper: {class: 'min-w-0'}, text: {class: 'min-w-0 grow'}}" v-if="!identifierError" id="identifier-help">
          <div v-if="!identifier" style="font-weight:normal;line-height: 1.75em;">
            <p>You will use this identifier to sign in to websites through this web browser.</p>
            <p class="mt-2">New to triauth? <a href="https://www.triauth.org/identity/get-started" target="_blank" rel="noopener noreferrer" class="underline inline-block">See what you need to get started.</a></p>
          </div>
          <div v-else>
            <div class="_status"><span>✓</span>Identifier format is fine</div>

            <div class="_status" v-if="!whoisResponse">
              <span>-</span>please wait ...
            </div>
            <div class="_status" v-else-if="whoisResponse.error">
              <span>✕</span>An error has occurred - {{whoisResponse.error.message}}
            </div>
            <div v-else-if="whoisResponse.nxdomain">
              <div class="_status"><span>✕</span>Domain not found</div>

              <div class="_dns-hint mt-3 p-3 rounded-md border border-gray-200 bg-gray-50 leading-relaxed">
                <div class="_status">
                  <InfoIcon class="_info" aria-hidden="true"/>
                  <p>Check spelling. There seems to be no <strong>{{ identifierDomain }}</strong> domain.</p>
                  <p class="mt-3">If you like the name, you can try to buy the domain and claim your unique identifier in just a few minutes.</p>
                  <p class="mt-3"><Button as="a" :href="'https://www.cloudflare.com/domains/search?q=' + encodeURIComponent(identifierDomain)" target="_blank" rel="noopener noreferrer" variant="outlined" size="small" class="_ext">Check availability with Cloudflare Registrar<OpenInNewIcon aria-hidden="true"/></Button></p>
                  <p class="mt-3">Besides triauth, you can use the same domain for personalized email, websites, and more.</p>
                </div>
              </div>
            </div>
            <div v-else-if="whoisResponse.status === -1">
              <div class="_status"><span>✕</span>Domain is not configured for triauth</div>

              <div class="_dns-hint mt-3 p-3 rounded-md border border-gray-200 bg-gray-50 leading-relaxed">
                <div class="_status">
                  <InfoIcon class="_info" aria-hidden="true"/>
                  Who manages the <strong>{{ identifierDomain }}</strong> domain?
                  <div class="mt-2"><SelectButton v-model="manages" :options="managesOptions" optionLabel="label" optionValue="value" :allowEmpty="false" size="small" aria-label="Who manages the domain"/></div>

                  <template v-if="manages === 'me'">
                    <p class="mt-3" v-if="whoisResponse.brokenRecord">
                      The <strong>{{ identifierDomain }}</strong> domain has a broken triauth record.
                      Replace it with the single TXT record below:
                    </p>
                    <p class="mt-3" v-else-if="dnsHost?.name">
                      Sign in to <a :href="dnsHost.url" target="_blank" rel="noopener noreferrer" class="underline">{{ dnsHost.name }}</a>, which hosts the DNS records of <strong>{{ identifierDomain }}</strong>, and add the TXT record below:
                    </p>
                    <p class="mt-3" v-else>
                      Sign in to the DNS panel of <strong>{{ identifierDomain }}</strong> and add the TXT record below to its DNS settings:
                    </p>

                    <pre class="_code _code-compact text-left"><span style="opacity:0.5;user-select:none;">{{ identifierDomain }} TXT </span>"<span class="_sel" :title="copyTitle" @click="selectFragment">triauth {{ endpointHost }}</span>"</pre>

                    <table class="_record mt-3" aria-label="DNS TXT record to add">
                      <tbody>
                      <tr>
                        <th scope="row">Host / Name</th>
                        <td>
                          <template v-if="!dnsHost?.name && hostField === identifierDomain">In this field, most panels take <code class="_sel" :title="copyTitle" @click="selectFragment">@</code> or an empty field for the domain itself. A few take the full name <code class="_sel" :title="copyTitle" @click="selectFragment">{{ identifierDomain }}</code>.</template>
                          <template v-else-if="hostField === ''">Leave this field empty</template>
                          <template v-else>
                            <code class="_sel" :title="copyTitle" @click="selectFragment">{{ hostField }}</code>
                            <template v-if="!dnsHost?.name"><br/>A few panels take the full name <code class="_sel" :title="copyTitle" @click="selectFragment">{{ identifierDomain }}</code> instead.</template>
                          </template>
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">Record Type</th>
                        <td><code>TXT</code></td>
                      </tr>
                      <tr>
                        <th scope="row">Value / Content</th>
                        <td><code class="_sel" :title="copyTitle" @click="selectFragment">triauth {{ endpointHost }}</code></td>
                      </tr>
                      <tr>
                        <th scope="row">TTL</th>
                        <td>Leave the default value</td>
                      </tr>

                      </tbody>
                    </table>

                    <p class="mt-3">Stuck? The <a href="https://www.triauth.org/identity/get-started" target="_blank" rel="noopener noreferrer" class="underline">getting started guide</a> walks you through this step.</p>
                  </template>

                  <template v-else-if="manages === 'other'">
                    <template v-if="whoisResponse.brokenRecord">
                      <p class="mt-3">The domain has a broken triauth record. Ask whoever manages the domain to fix it.</p>
                    </template>
                    <template v-else>
                      <p class="mt-3">Ask whoever manages it to enable triauth for the domain. That is usually the person who registered the domain, or your IT team.</p>
                      <p class="mt-3"><Button size="small" variant="outlined" @click="askVisible = true">Show the message to send</Button></p>
                    </template>
                    <p class="mt-3">When it is done, come back and click <strong>Check again</strong>.</p>
                  </template>
                </div>
              </div>
            </div>
            <div class="_status" v-else-if="whoisResponse.originMismatch">
              <span>✕</span>Please use <a :href="whoisResponse.authenticationEndpoint.url" rel="noreferrer" class="wrap-anywhere">{{whoisResponse.authenticationEndpoint.url}}</a>
            </div>
            <div class="_status" v-else-if="whoisResponse.modeMismatch">
              <span>✕</span>This domain is configured with unsupported mode
            </div>
            <div v-else-if="isPrivate">
              <div class="_status"><span>✓</span>Domain is configured for triauth</div>
              <div class="_status mt-3"><InfoIcon class="_info" aria-hidden="true"/>This domain runs in private mode.</div>
            </div>
            <div v-else-if="whoisResponse.status === 0">
              <div class="_status"><span>✓</span>Domain is configured for triauth</div>
              <div class="_status mt-3"><InfoIcon class="_info" aria-hidden="true"/>You are configuring this identifier for the first time</div>
            </div>
            <div v-else-if="whoisResponse.status === 1">
              <div class="_status"><span>✓</span>Domain is configured for triauth</div>
              <div class="_status mt-3"><InfoIcon class="_info" aria-hidden="true"/>You have {{whoisResponse.devices.length}} device(s) already configured</div>
            </div>
          </div>
        </Message>
        <Message size="small" severity="error" variant="simple" class="text-left" v-if="recheck === 'unchanged'">
          <div class="_status"><span>✕</span>The record is not visible yet. DNS changes can take a few minutes to show up. If it has been a while, see the <a href="https://www.triauth.org/identity/troubleshooting#domain-is-not-configured-for-triauth" target="_blank" rel="noopener noreferrer" class="underline">troubleshooting guide</a>.</div>
        </Message>
        <Message size="small" severity="error" variant="simple" class="text-left" v-if="identifierError">
          <div class="_status"><span>✕</span>{{identifierError}}</div>
        </Message>

        <Button class="_recheck" severity="help" :loading="recheck === 'pending'" @click="recheckDomain" v-if="canRecheck">Check again</Button>
        <Button class="mt-10" :disabled="!canContinue" @click="next">Continue</Button>
        <Button variant="text" as="a" href="#" size="small" v-if="cancellable">cancel</Button>
        <Button v-for="entry of testIdentitiesRef" :key="entry.identifier" @click="addTestIdentity(entry)" variant="text" as="a">add test identity {{ entry.identifier }}</Button>
      </div>

      <Dialog v-model:visible="askVisible" modal :header="'Ask whoever manages ' + identifierDomain" :draggable="false" :style="{width: 'min(95vw, 36rem)'}">
        <p class="text-sm leading-relaxed">That is usually the person who registered the domain, or your IT team. If you do not know their address, these are the usual ones:</p>
        <p class="mt-2"><code v-for="address of askRecipients" :key="address" class="_sel inline-block mr-2 mb-1 px-2 py-0.5 rounded border border-gray-200 bg-white text-sm" :title="copyTitle" @click="selectFragment">{{ address }}</code></p>
        <pre class="_sel mt-3 p-3 rounded border border-gray-200 bg-gray-50 text-sm leading-relaxed whitespace-pre-wrap break-words font-sans" :title="copyTitle" @click="selectFragment">{{ askMessage }}</pre>
        <div class="flex flex-wrap items-center gap-2 mt-3">
          <Button size="small" variant="outlined" @click="copyText(askMessage)" style="min-width:125px;">{{ copied ? '✓ Copied' : 'Copy message' }}</Button>
          <Button as="a" :href="askMailto" size="small" variant="outlined">Open in email app</Button>
          <Button v-if="canShare" size="small" variant="outlined" @click="shareAsk">Share…</Button>
        </div>
      </Dialog>
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
            <div class="_status" v-if="codeWhoisResponse?.error">
              <span>✕</span>An error has occurred - {{ codeWhoisResponse.error.message }} <a href @click.prevent="lookupWithCode(lookupCode)">try again</a>
            </div>
            <div class="_status" v-else-if="codeWhoisResponse && !codeWhoisResponse.identityDomain">
              <span>✕</span>No identity domain could be derived for {{ identifierDomain }} - check the domain's configuration
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
            <div class="_status" v-else-if="!codeWhoisResponse"><span>-</span>please wait ...</div>
            <div class="_status" v-else-if="codeWhoisResponse.error"><span>✕</span>An error has occurred - {{ codeWhoisResponse.error.message }} <a href @click.prevent="lookupWithCode(lookupCode)">try again</a></div>
            <div class="_status" v-else-if="codeWhoisResponse.status === 1"><span>✓</span>Lookup code accepted - you have {{ codeWhoisResponse.devices.length }} device(s) already configured</div>
            <div class="_status" v-else><span>✕</span>No identity records were found for this code. Check it for typos, or choose the first option if you are setting up this identifier for the first time.</div>
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
        <InputText id="deviceName" v-model="deviceName" @input="validateDeviceName" @keydown.enter.prevent="submitField" aria-describedby="deviceName-help" placeholder="e.g., laptop" autocapitalize="none" autocorrect="off" spellcheck="false" autofocus />
        <Message size="small" :severity="(deviceNameError || deviceNameExists) ? 'error' : 'secondary'" variant="simple" class="text-left" id="deviceName-help">
          <div class="_status" v-if="deviceNameError">
            <span>✕</span>{{deviceNameError}}
          </div>
          <div v-else-if="!deviceName">
            How would you like to call this device?<br/>
            This name will be publicly visible in your identity records.
          </div>
          <div class="_status" v-else-if="deviceNameExists">
            <span>✕</span>A device with this name already exists
          </div>
          <div class="_status" v-else>
            <span>✓</span>That's a good name
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
                <Tag v-if="signer.factor" severity="secondary" class="mr-2">Something you {{ signer.factor }}</Tag>
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

        <p class="text-left leading-relaxed wrap-anywhere">
          <template v-if="dnsHost?.name">
            Please sign in to <a :href="dnsHost.url" target="_blank" rel="noopener noreferrer" class="underline">{{ dnsHost.name }}</a>, which hosts the
            <strong><span class="_sel" :title="copyTitle" @click="selectFragment">{{ dnsHost.zone }}</span></strong>
            domain,
          </template>
          <template v-else>
            Please sign in to the administration panel of
            <strong><span class="_sel" :title="copyTitle" @click="selectFragment">{{identityDomainParts.parent}}</span></strong>
            domain
          </template>
          <span v-for="[k, lines] of Object.entries(dnsRecords())" :key="k">
            <span v-if="lines.length">
              <span v-if="k === 'toRemove'"><br/><br/>remove the following existing DNS TXT record(s) for the <strong><span class="_sel" :title="copyTitle" @click="selectFragment">{{identityDomainParts.prefix}}</span><wbr/><span style="opacity:0.7;">{{identityDomainParts.suffix}}</span></strong> subdomain:</span>
              <span v-if="k === 'toAdd'">and add the following DNS TXT record(s) for the <strong><span class="_sel" :title="copyTitle" @click="selectFragment">{{identityDomainParts.prefix}}</span><wbr/><span style="opacity:0.7;">{{identityDomainParts.suffix}}</span></strong> subdomain:</span>
              <pre class="_code text-left"><span v-for="(rec, i) of lines" :key="i" style="display:block;"><span style="opacity:0.5;"><span class="_sel" :title="copyTitle" @click="selectFragment">{{ identityDomainParts.prefix }}</span>{{ identityDomainParts.suffix }} TXT </span>"<span class="_sel" :title="copyTitle" @click="selectFragment">{{ rec }}</span>"</span></pre>
              <span v-if="k === 'toAdd' && identityWhois?.identityDomain" class="block text-right -mt-6">
                <span class="text-sm text-gray-500 mr-3" aria-live="polite" v-if="copied">✓ Copied to clipboard</span>
                <span class="text-sm text-gray-500 mr-3" v-if="dnsHost?.zoneImport">{{ dnsHost.name }} can import a zone file:</span>
                <Button @click="exportZoneFile" variant="text" size="small">Export to Zone File</Button>
              </span>
            </span>
          </span>
        </p>

        <Message size="small" severity="secondary" variant="simple" class="text-left" v-if="isPrivate">
          <div class="_status"><InfoIcon class="_info" aria-hidden="true"/>The subdomain name is derived from your identifier and your lookup code.</div>
        </Message>

        <Message size="small" :severity="!dnsRecordsVerified ? 'error' : 'secondary'" variant="simple" class="text-left" v-if="dnsRecordsVerified !== undefined && dnsRecordsVerified !== null">
          <div class="_status" v-if="!dnsRecordsVerified">
            <span>✕</span>TXT records are not visible yet. DNS changes can take a few minutes to show up. If it has been a while, see the <a href="https://www.triauth.org/identity/troubleshooting#txt-records-are-not-visible-yet" target="_blank" rel="noopener noreferrer" class="underline">troubleshooting guide</a>.
          </div>
          <div class="_status" v-else>
            <span>✓</span>All looks good
          </div>
        </Message>

        <Message size="small" severity="error" variant="simple" class="text-left" v-if="setupErrorRef"><div class="_status"><span>✕</span>{{ setupErrorRef }}</div></Message>


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
import OpenInNewIcon from '../../vendor/material-icons/OpenInNew.vue';
import InfoIcon from '../../vendor/material-icons/Info.vue';
import KeyIcon from '../../vendor/material-icons/Key.vue';
import PasswordIcon from '../../vendor/material-icons/Password.vue';
import SecurityKeyIcon from '../../vendor/material-icons/SecurityKey.vue';

import ContextMenu from "primevue/contextmenu";
import Dialog from "primevue/dialog";
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
// - its fetch keeps the latest DoH answer: after a -1 whois that is the domain's own TXT lookup, whose status
//   tells a domain that does not exist (3) from one without a usable triauth record, which whois folds together
let lastDnsAnswer = null;
const triauthConfig = {resolver: new Triauth.Resolvers.Cloudflare({
  fetch: (url, init) => fetch(url, init).then((response) => { lastDnsAnswer = response.clone().json().catch(() => null); return response; })
})};

////////////
// Step - identifier

const identifier = ref('');
const identifierError = ref(null);
const whoisResponse = ref(null);
const dnsHost = ref(null);   // the zone holding the domain, with {name, url, zoneImport, apex} of its DNS host when recognised
const isPrivate = computed(() => whoisResponse.value?.authenticationEndpoint?.options?.mode === 'private');
const recheck = ref(null);   // "Check again": null | 'pending' | 'unchanged'

const canContinue = computed(() => whoisResponse.value?.status >= 0 && !whoisResponse.value.originMismatch && !whoisResponse.value.modeMismatch);
const canRecheck = computed(() => !identifierError.value && !!whoisResponse.value && !canContinue.value);

// Domain part of the identifier (e.g. 'example.com' for 'john@example.com') and the hostname of
// this authenticator — used to show the DNS setup hint when a domain isn't configured for triauth.
const identifierDomain = computed(() => identifier.value.split('@')[1] || '');
const endpointHost = window.location.hostname;

// What goes in the panel's Host / Name field: for the zone itself a recognised panel's own convention ('@' or an empty
// field), else the full name, which the row turns into a note; below the zone the labels above it, which every panel takes
const hostField = computed(() => {
  const domain = identifierDomain.value, zone = dnsHost.value?.zone;
  if (domain === zone) return dnsHost.value.name ? dnsHost.value.apex : domain;
  return zone && domain.endsWith('.' + zone) ? domain.slice(0, -zone.length - 1) : domain;
});

// "Somebody else manages this domain?": a message to forward, with the usual addresses as recipients
const manages = ref(null);   // 'me' | 'other', kept while the step is open
const managesOptions = [{label: 'I do', value: 'me'}, {label: 'Someone else', value: 'other'}];
const askVisible = ref(false);
const askRecipients = computed(() => ['admin', 'hostmaster', 'postmaster'].map((name) => `${name}@${identifierDomain.value}`));
const askSubject = computed(() => `Enabling triauth for ${identifierDomain.value}`);
const askMessage = computed(() => [
  'Hi,', '',
  `Could ${identifierDomain.value} enable triauth? I would like to use it with ${identifier.value}.`, '',
  'https://www.triauth.org/', '',
  // 'triauth is a decentralized, phishing-resistant single sign-on protocol for passwordless sign-in. Members sign in with an identifier at our domain, their private keys never leave their devices, and the domain itself is the source of truth for who may sign in.', '',
  'For our organization that means:',
  '- Improved security with phishing-resistant, device-based sign-in for all members.',
  '- Ability to grant, review and revoke access for every member and device from DNS panel we already have.',
  '- Nothing to run, maintain, and nothing to pay per user.', '',
  'The rollout guide covers the setup: https://www.triauth.org/organizations/', '',
  'Thanks!'
].join('\n'));
const askMailto = computed(() => `mailto:${askRecipients.value.join(',')}?subject=${encodeURIComponent(askSubject.value)}&body=${encodeURIComponent(askMessage.value)}`);
const canShare = typeof navigator.share === 'function';
const shareAsk = () => navigator.share({title: askSubject.value, text: askMessage.value}).catch(() => {});

const validateIdentifier = async () => {
  identifier.value = identifier.value.toLowerCase();

  // Every edit invalidates the previous lookup. An emptied field shows the intro again.
  whoisResponse.value = null;
  dnsHost.value = null;
  recheck.value = null;
  if (identifier.value === '') {
    identifierError.value = null;
    return;
  }

  identifierError.value = Triauth.validate({identifier:identifier.value}, triauthConfig).errors[0]?.message;

  const configuredIdentifiers = await db.list('identities');
  if (
      !identifierError.value &&
      Object.values(configuredIdentifiers).map((ci) => ci.identifier).indexOf(identifier.value) >= 0
  ) {
    identifierError.value = 'Identifier is already configured on this device';
  }

  whoisIdentifier();
}

// Sortlist of registries that sell names one level below the TLD
const SECOND_LEVEL_SUFFIXES = [
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk',
  'com.br', 'net.br', 'org.br',
  'com.au', 'net.au', 'org.au', 'id.au',
  'co.za', 'org.za', 'net.za', 'web.za',
  'com.tr', 'net.tr', 'org.tr', 'gen.tr', 'web.tr',
  'com.mx', 'org.mx', 'net.mx',
  'co.kr', 'or.kr', 'ne.kr', 'pe.kr',
  'com.ar', 'net.ar', 'org.ar',
  'co.nz', 'net.nz', 'org.nz', 'geek.nz', 'gen.nz', 'kiwi.nz',
  'my.id', 'co.id', 'web.id', 'biz.id', 'or.id',
  'co.jp', 'ne.jp', 'or.jp', 'gr.jp',
  'com.pl', 'net.pl', 'org.pl', 'biz.pl', 'info.pl',
  'co.il', 'org.il', 'net.il',
  'com.ua', 'net.ua', 'org.ua', 'in.ua',
  'com.cn', 'net.cn', 'org.cn',
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in',
  'com.tw', 'net.tw', 'org.tw', 'idv.tw',
  'com.vn', 'net.vn', 'org.vn',
  'co.th', 'in.th', 'or.th',
  'com.my', 'net.my', 'org.my', 'com.sg', 'net.sg', 'org.sg', 'per.sg', 'com.hk', 'net.hk', 'org.hk', 'idv.hk', 'com.ph',
  'co.ke', 'or.ke', 'com.ng', 'org.ng', 'net.ng', 'com.eg', 'com.sa', 'com.pk', 'com.bd', 'com.np', 'com.kh',
  'com.co', 'com.pe', 'com.ec', 'com.uy', 'com.ve', 'com.do', 'com.gt', 'co.cr', 'com.bo', 'com.py'
];
const isRegistrable = (domain) => {
  const parent = domain.split('.').slice(1).join('.');
  return !parent.includes('.') || SECOND_LEVEL_SUFFIXES.includes(parent);
};

// Known DNS hosts, told apart by the primary nameserver of a zone
const DNS_HOSTS = [
  {name: 'Cloudflare',      match: /\.ns\.cloudflare\.com$/,              url: (zone) => `https://dash.cloudflare.com/?to=/:account/${zone}/dns/records`, zoneImport: true},
  {name: 'GoDaddy',         match: /\.domaincontrol\.com$/,               url: (zone) => `https://dcc.godaddy.com/control/dnsmanagement?domainName=${zone}`, zoneImport: true},
  {name: 'Namecheap',       match: /\.registrar-servers\.com$/,           url: (zone) => `https://ap.www.namecheap.com/Domains/DomainControlPanel/${zone}/advanceddns`},
  {name: 'Porkbun',         match: /\.ns\.porkbun\.com$/,                 url: () => 'https://porkbun.com/account/domainsSpeedy', apex: ''},
  {name: 'IONOS',           match: /\.ui-dns\.(com|de|org|biz)$/,         url: () => 'https://my.ionos.com/domains'},
  {name: 'OVHcloud',        match: /\.(ovh\.net|anycast\.me)$/,           url: (zone) => `https://www.ovh.com/manager/#/web/domain/${zone}/zone`, zoneImport: true, apex: ''},
  {name: 'Amazon Route 53', match: /\.awsdns-\d+\.(com|net|org|co\.uk)$/, url: () => 'https://console.aws.amazon.com/route53/v2/hostedzones', zoneImport: true, apex: ''},
  {name: 'Squarespace',     match: /\.squarespacedns\.com$/,              url: () => 'https://account.squarespace.com/domains'},
  {name: 'DigitalOcean',    match: /^ns[1-3]\.digitalocean\.com$/,        url: (zone) => `https://cloud.digitalocean.com/networking/domains/${zone}`},
  {name: 'Hetzner',         match: /\.ns\.hetzner\.(com|de)$/,            url: () => 'https://dns.hetzner.com/', zoneImport: true},
  {name: 'Hostinger',       match: /\.dns-parking\.com$/,                 url: () => 'https://hpanel.hostinger.com/domains', zoneImport: true},
];

// The zone holding the domain, with {name, url, zoneImport, apex} of its DNS host when recognised; null without an SOA.
const findDnsHost = async (domain) => {
  let answer = null;
  await triauthConfig.resolver.resolve(domain, 'SOA', {
    fetch: (url, init) => fetch(url, init).then((response) => { answer = response.clone().json().catch(() => null); return response; })
  }).catch(() => {});
  const dns = await answer;

  const soa = [...(dns?.Answer || []), ...(dns?.Authority || [])].find((r) => r.type === 6);
  if (!soa) return null;
  const [zone, primary] = [soa.name, soa.data.split(' ')[0]].map((n) => n.toLowerCase().replace(/\.$/, ''));
  const host = DNS_HOSTS.find((h) => h.match.test(primary));
  return host ? {zone, name: host.name, url: host.url(zone), zoneImport: !!host.zoneImport, apex: host.apex ?? '@'} : {zone};
};

// Looks the identifier's domain up and flags originMismatch, modeMismatch, nxdomain, and brokenRecord responses
const lookupIdentifier = async () => {
  const currentIdentifier = identifier.value;
  const response = await Triauth.whois({identifier: currentIdentifier}, triauthConfig);

  if (response.status >= 0) {
    response.originMismatch = window.location.hostname !== 'localhost' && new URL(response.authenticationEndpoint.url).origin !== window.location.origin;
    response.modeMismatch = ['public', 'private'].indexOf(response.authenticationEndpoint.options.mode) < 0;
  } else if (response.status === -1) {
    const dns = await lastDnsAnswer;
    response.nxdomain = dns?.Status === 3 && isRegistrable(currentIdentifier.split('@')[1]);
    response.brokenRecord = (dns?.Answer || []).some((a) => a.type === 16 && /^"?triauth\b/.test(a.data));
  }

  if (currentIdentifier !== identifier.value) return;
  whoisResponse.value = response;

  // The domain exists: find who serves its zone, for the links to its DNS settings. Not awaited, so the status line
  // does not wait on it; the link appears when the answer lands
  if (!response.error && !response.nxdomain) findDnsHost(currentIdentifier.split('@')[1]).then((host) => { if (currentIdentifier === identifier.value) dnsHost.value = host; });
};

const whoisIdentifier = useDebounceFn(async () => {
  whoisResponse.value = null;
  if (identifier.value && !identifierError.value) await lookupIdentifier();
}, 750);

const recheckDomain = async () => {
  const currentIdentifier = identifier.value;

  // for nxdomain, do the whole validation again on recheck
  if (whoisResponse.value?.nxdomain) {
    whoisResponse.value = null;
    recheck.value = null;
    await lookupIdentifier();
    return;
  }

  // otherwise show helpful error
  const wasUnconfigured = whoisResponse.value?.status === -1;
  recheck.value = 'pending';
  await lookupIdentifier();
  if (currentIdentifier !== identifier.value) return;
  recheck.value = wasUnconfigured && whoisResponse.value?.status === -1 && !whoisResponse.value.nxdomain ? 'unchanged' : null;
};

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
  deviceName.value = deviceName.value.toLowerCase();
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

const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text); } catch { return; }

  copied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { copied.value = false; }, 1500);
};

const selectFragment = (event) => {
  const el = event.currentTarget;
  window.getSelection()?.selectAllChildren(el);
  copyText(el.textContent);
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

// Whether a whois answer lists this device with exactly the keys about to be published
const listsThisDevice = (whois) => (whois?.devices || []).some((dev) =>
  dev.deviceName === deviceName.value && dev.keys.length === signers.value.length &&
  signers.value.every((signer, i) =>
    signer.publishableKey === dev.keys[i].value &&
    Object.entries(signer.publishableKeyOptions()).every(([k, v]) => dev.keys[i].options?.[k] === v)
  )
);

// Google's resolver, for a second look at verification: the identifier step asked Cloudflare's resolver about the
// identity name before the records existed, and that empty answer stays cached there for the zone's negative TTL
const secondOpinionConfig = {resolver: new Triauth.Resolvers.Google()};

const verifyDnsRecords = async () => {
  dnsRecordsVerified.value = null;

  let currentWhoisResponse = await Triauth.whois(whoisOptions(), triauthConfig);
  if (!listsThisDevice(currentWhoisResponse)) currentWhoisResponse = await Triauth.whois(whoisOptions(), secondOpinionConfig);

  const verified = listsThisDevice(currentWhoisResponse);
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

/* The TXT record as the fields of a DNS panel: label column, value column with field-like cells */
._record { border-collapse:collapse; width:100%; }
._record th { font-weight:normal; text-align:left; padding:0.25rem 0.75rem 0.25rem 0; width:1%; white-space:nowrap; vertical-align:top; }
._record td { padding:0.25rem 0; }
._record td code { display:inline-block; max-width:100%; padding:0.125rem 0.5rem; border:1px solid var(--color-gray-200); border-radius:0.25rem; background:white; color:var(--p-text-color, #334155); font-size:0.8125rem; line-height:1.5; overflow-wrap:anywhere; }
/* The info sign as an SVG: Android's text fonts have no glyph for 🛈 */
._info { display:inline-block; width:1.125em; height:1.125em; fill:currentColor; vertical-align:-0.125em; }

/* A line led by a mark (✓ ✕ - or the info sign): the mark hangs in a fixed gutter and the text wraps beside it.
   One gutter for every mark keeps the text column in place when the state changes */
._status { position:relative; padding-left:1.6em; }
._status > :first-child { position:absolute; left:0; top:0; }
._status > ._info:first-child { top:calc((1lh - 1.125em) / 2); }   /* centred on the first line of text */

/* A button that leaves the app: the "open in new" icon follows the label, in the button's own colour */
._ext svg { width:1rem; height:1rem; fill:currentColor; }

/* On narrow screens the labels wrap, so the values keep enough room to stay on one line */
@media (max-width: 480px) { ._record th { white-space:normal; } }

/* Code and prose fragments that a click selects whole, for pasting into a DNS panel */
._sel { cursor:copy; border-radius:0.15rem; }
._sel:hover { background:color-mix(in srgb, currentColor 15%, transparent); }

/* "Check again" above Continue: it hands Continue's top margin back, so the two buttons sit one flex gap apart */
._recheck { margin-bottom:-2.5rem; }

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

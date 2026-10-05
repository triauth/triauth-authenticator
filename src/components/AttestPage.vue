<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<script setup>
import { ref, onUnmounted } from 'vue';
import { Authenticator } from "../lib/authenticator.js";

import { db } from '../db/db.js'

import OpenInNewIcon from '../../vendor/material-icons/OpenInNew.vue';
import VerifiedIcon from '../../vendor/material-icons/Verified.vue';
import {Helpers} from "../lib/helpers.js";

import {AppError} from "../lib/errors.js";

// One of 'verifying', 'error', 'pending', 'denied', 'responseVerified'
const stateRef = ref('verifying');

let challenge = null;
let challengeDigest = null;
let baseUrl = null;
let identity = null;
let website = null;

let callbackMethod = 'POST';
let callbackUrl = null;

const errorMessageRef = ref('');

let requestedAttestRef = ref({});

const inCoolOffPeriodRef = ref(true);
setTimeout(() => inCoolOffPeriodRef.value = false, 1e3);

const busyRef = ref(false);

const pageLoadTimestamp = Date.now();

setup();

async function setup() {
  const params = Helpers.urlFragmentParams(window.location);

  if (params.get('response')) {
    await verifyResponse(params);

  } else {
    await verifyRequest();

  }
}

async function verifyResponse(params) {
  try {
    const response = params.get('response');
    const tokenValue = params.get('verifyToken');

    if (!Triauth.Validator.validateResponse(response).valid) {
      throw new AppError('Invalid or missing response parameter', {response});
    }

    if (typeof tokenValue !== 'string' || tokenValue.length === 0 || Triauth.Helpers.byteSize(tokenValue) > 128) {
      throw new AppError('Invalid or missing token parameter', {tokenValue});
    }

    // Save the response to the verification request in the tokens DB
    const existingToken = await db.find('tokens', {value: tokenValue, type: 'attestVerifyToken'});
    if (existingToken?.id && !existingToken.response && !Helpers.tokenExpired(existingToken)) {
      await db.patch('tokens', {id: existingToken.id, response, lastUsedAt: Date.now()});
    }

    stateRef.value = 'responseVerified';

    window.close();

  } catch (err) {
    Triauth.config.logger.error(err, err.data);
    stateRef.value = 'error';
    errorMessageRef.value = err instanceof AppError ? err.message : 'Internal error has occurred';

  }
}

async function verifyRequest() {
  try {
    const requestData = Helpers.parseRequest(window.location, 'attest');
    const {identifier, ext, hmac, challengeString} = requestData;

    challenge = requestData.challenge;
    baseUrl = requestData.baseUrl;
    callbackUrl = requestData.callbackUrl;

    // Do the security checks for referrer
    Helpers.ensureReferrerMatch(baseUrl);

    // Load the requested identity
    identity = await db.find('identities', {identifier});

    if (!identity) {
      throw new AppError(`A website tried to request an attestation for ${challenge.identity.identifier} but this browser is not yet configured with this identifier.`, {identifier, baseUrl:baseUrl.href});
    }

    // Find the token that should be used with this request
    const token = await db.find('tokens', {type:'attestToken', identityId:identity.id, baseUrl:baseUrl.href });

    if (!token || Helpers.tokenExpired(token)) {
      throw new AppError('Referring website used an invalid or expired token', {identityId:identity.id, baseUrl:baseUrl.href});
    }

    // Do the security checks for hmac token
    await Helpers.ensureValidHmac(hmac, token.value, challengeString);

    await db.patch('tokens', {id: token.id, lastUsedAt: Date.now()});

    // Double-check that the website entry in DB exists for the given token, and that the website has permission
    website = await db.find('websites', {id: token.websiteId, identityId:identity.id});
    if (!website) {
      throw new AppError('Referring website is not recognized', {tokenId:token.id, websiteId:token.websiteId, identityId:identity.id});
    }

    // Validate the attestations, as embedded in challenge.data.attest
    if (!Triauth.Validator.validateAttestations(challenge.data.attest).valid) {
      throw new AppError('challenge.data.attest validation failed', {attestations:challenge.data.attest});
    }

    // Extract the attest field from authenticationRequest into requestedAttestRef
    for (const [k,v] of Object.entries(challenge.data.attest || {})) {
      requestedAttestRef.value[k] = v;
    }

    // Compute the challenge digest to be used in verifications
    challengeDigest = await Triauth.Helpers.sha256(challenge.challengeString);

    // If there are any requested attestations present, start the loop to listen for attestVerifyToken changes (responses from verification providers)
    if (Object.keys(requestedAttestRef.value).length > 0) {
      refreshAttestationTokensLoop();
    }

    // Extract the callbackMethod from ext
    callbackMethod = ext['callbackMethod'];

    stateRef.value = 'pending';

  } catch (err) {
    Triauth.config.logger.error(err, err.data);
    stateRef.value = 'error';
    errorMessageRef.value = err instanceof AppError ? err.message : 'Internal error has occurred';

  }
}

async function performVerification(attestId) {
  try {

    // Cleanup previously issued token for this verification provider (if any)
    const existingToken = requestedAttestRef.value[attestId].token;
    if (existingToken?.id) {
      requestedAttestRef.value[attestId].token = undefined;
      await db.delete('tokens', existingToken.id);
    }

    const url = new URL(requestedAttestRef.value[attestId].selectedProvider);

    const tokenValue = Triauth.Helpers.randomString(24);

    const token = await db.add('tokens', {
      identityId: identity.id,
      websiteId: website.id,
      baseUrl: url.href,
      origin: url.origin,
      type: 'attestVerifyToken',
      value: tokenValue,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60e3
    });

    requestedAttestRef.value[attestId].token = token;

    url.searchParams.set('callbackUrl', window.location.origin + window.location.pathname + '#?verifyToken=' + tokenValue);
    url.searchParams.set('challenge', challengeDigest);

    window.open(url, '_blank', 'noopener');

  } catch (err) {
    Triauth.config.logger.error(err, err.data);
    stateRef.value = 'error';
    errorMessageRef.value = err instanceof AppError ? err.message : 'Internal error has occurred';

  }
}

async function refreshAttestationTokens() {
  for (const [k,v] of Object.entries(requestedAttestRef.value)) {
    if (v.token && !v.token.response) {
      v.token = await db.find('tokens', {id:v.token.id});
      if (v.token.response) {

        // Verify the response - the verification is quite lax, as the client website will do the final proper verification
        const verifyRes = await Triauth.verify(challengeDigest, v.token.response, {
          type: 'attest',
          notBefore: pageLoadTimestamp - Triauth.config.maximalAllowedClientClockDrift,
          notAfter: Date.now() + Triauth.config.maximalAllowedClientClockDrift
        });

        v.token.isVerified = verifyRes?.valid === true;
      }
    }
  }
}

let attestPollTimer = null;
async function refreshAttestationTokensLoop() {
  try {
    await refreshAttestationTokens();
  } catch (err) {
    // e.g. a read aborted when the browser froze this tab while the provider was open; keep polling
    Triauth.config.logger.error(err);
  }
  attestPollTimer = setTimeout(refreshAttestationTokensLoop, 500);
}

function stopAttestPoll() {
  clearTimeout(attestPollTimer);
  attestPollTimer = null;
}
onUnmounted(stopAttestPoll);

// Cleans up used and expired attestVerifyTokens
async function cleanupTokens() {
  for (const [k,v] of Object.entries(requestedAttestRef.value)) {
    if (v.token?.id) {
      await db.delete('tokens', v.token.id);
    }
  }

  const now = Date.now();
  const attestVerifyTokens = await db.list('tokens', {type: 'attestVerifyToken'});

  for (const token of Object.values(attestVerifyTokens)) {
    if (token.expiresAt && token.expiresAt < now) {
      await db.delete('tokens', token.id);
    }
  }
}

async function deny() {
  if (busyRef.value) return;
  busyRef.value = true;

  stopAttestPoll();
  await cleanupTokens();

  stateRef.value = 'denied';

  if (Helpers.referrerMatchesCallback(callbackUrl)) {
    Helpers.sendResponse(callbackMethod, callbackUrl, 'false');

  }
}

async function confirm() {
  if (busyRef.value) return;
  busyRef.value = true;

  try {
    stopAttestPoll();
    const authenticator = new Authenticator(identity, identity.signers);
    const selfSig = await authenticator.process('attest', baseUrl.href, challengeDigest);

    const signatures = [selfSig];

    for (const [k,v] of Object.entries(requestedAttestRef.value)) {
      signatures.push(v.token.response);
    }

    const response = Triauth.MultiSignature.generate(...signatures);

    await cleanupTokens();

    Helpers.sendResponse(callbackMethod, callbackUrl, response);

  } catch (err) {
    Triauth.config.logger.error(err, err.data);
    stateRef.value = 'error';
    errorMessageRef.value = err instanceof AppError ? err.message : 'Internal error has occurred';
    busyRef.value = false;
  }
}

</script>

<template>
  <div class="m-auto rounded-lg border border-gray-200 bg-white text-left shadow-md " style="margin-top:10vh;max-width:min(90vw,640px);">
    <div :class="[stateRef === 'error' ? 'bg-red-600' : 'bg-blue-600']" class="p-5 text-white font-bold rounded-tl-lg rounded-tr-lg flex flex-row justify-between">
      <div class="w-6"><strong>⠕</strong></div>
      <div class="text-left flex-1">&nbsp;</div>
    </div>

    <div class="p-5 text-center" v-if="stateRef === 'verifying'">
      Verifying, please wait ...
    </div>

    <div class="p-5 flex flex-col gap-4 text-center" v-else-if="stateRef === 'error'">
      <div class="font-bold p-2">Attestation request could not be processed</div>
      <div class="text-sm p-2">{{errorMessageRef}}</div>
      <div class="p-2">You can close this tab or navigate back to the previous page</div>
    </div>

    <div class="p-5 flex flex-col gap-4 text-center" v-else-if="stateRef === 'responseVerified'">
      <div class="font-bold p-2">Verification request completed</div>
      <div class="p-2">You can close this tab or navigate back to the previous page</div>
    </div>

    <div class="p-5 text-center" v-else-if="stateRef === 'denied'">
      <div class="font-bold">Request has been denied</div>
      <div class="p-2">You can close this tab or navigate back to the previous page</div>
    </div>

    <div class="p-5 flex flex-col gap-4 text-center" v-else-if="stateRef === 'pending'">

      <div class="m-7 mb-1 my-4 pt-4 p-6 text-center rounded-lg">
        <div class="font-bold py-2 text-lg break-all">
          {{baseUrl}}
        </div>
        <div class="text-sm py-2 text-slate-800 leading-relaxed">
          This website asks
          <strong>{{challenge.identity.identifier}}</strong>
          to confirm the following:
        </div>
      </div>

      <div>
          <div v-for="(val, key) in requestedAttestRef" :key="key">
            <div class="m-7 mt-0 my-4 pt-4 p-6 text-left border-y-gray-200 bg-gray-50 rounded-lg">
              <div class="font-bold py-2 flex align-middle">
                <label class="grow">{{val.label}}</label>
                <VerifiedIcon v-if="val.token?.isVerified"/>
              </div>
              <div class="text-sm py-2 text-slate-800 flex justify-between" v-if="!val.token?.isVerified">
                <Select v-model="val.selectedProvider" :options="val.providers" placeholder="Select verification provider" class="grow max-w-[65%]"/>
                <Button @click="performVerification(key)" class="font-normal" v-if="val.selectedProvider"><OpenInNewIcon/> Click to verify</Button>
              </div>
            </div>
          </div>


          <div class="text-gray-500 text-sm mx-4 text-justify p-4">
            The labels and list of third-party verification providers above was provided by the website above.
            After clicking the verify button you will be directed to the selected verification provider's website on which you can finish the verification.
            We have no control over, and disclaim any responsibility for, the content, privacy policies, or practices of any third-party verification providers.
          </div>
      </div>

      <div class="p-2 bg-yellow-200 inline-block rounded text-gray-800 text-sm" v-if="!Object.values(requestedAttestRef).every((v) => v.token?.isVerified)">Please complete the required verifications before you continue.</div>

      <div class="flex flex-col md:flex-row-reverse md:mx-4 gap-4 text-center justify-between mt-4">
        <Button @click="confirm()" :disabled="inCoolOffPeriodRef || busyRef || !Object.values(requestedAttestRef).every((v) => v.token?.isVerified)" class="md:w-1/2">Confirm</Button>
        <Button variant="outlined" @click="deny" :disabled="busyRef" class="md:w-1/2">Deny</Button>
      </div>
    </div>

  </div>
</template>

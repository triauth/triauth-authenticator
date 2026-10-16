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
import CloseIcon from '../../vendor/material-icons/Close.vue';
import {Helpers} from "../lib/helpers.js";

import {AppError, CancelledError} from "../lib/errors.js";

// One of 'verifying', 'unopened', 'error', 'pending', 'denied', 'responseVerified'
const stateRef = ref('verifying');

// A tab that opened on this request has no previous page to go back to
const canGoBack = window.history.length > 1;

let challenge = null;
let challengeDigest = null;
let baseUrl = null;
let identity = null;
let website = null;

let callbackMethod = 'GET';
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
    const verificationId = params.get('verification');

    // A provider that declined sends back 'false' instead of its signature
    if (response !== 'false' && !Triauth.Validator.validateResponse(response).valid) {
      throw new AppError('Invalid or missing response parameter', {response});
    }

    if (typeof verificationId !== 'string' || verificationId.length === 0 || Triauth.Helpers.byteSize(verificationId) > 128) {
      throw new AppError('Invalid or missing verification parameter', {verificationId});
    }

    // Save the provider's response to the verification that the attest page started
    const verification = await db.get('verifications', verificationId);
    if (verification && !verification.response && !Helpers.expired(verification)) {
      await db.patch('verifications', {id: verification.id, response});
    }

    stateRef.value = 'responseVerified';

    window.close();

  } catch (err) {
    Triauth.config.logger.error(err, err.data);
    stateRef.value = 'error';
    errorMessageRef.value = err instanceof AppError ? err.message : 'An internal error has occurred';

  }
}

async function verifyRequest() {
  let session, challengeString;

  try {
    ({session, challengeString} = await Helpers.openRequest(window.location));

  } catch (err) {
    // A request that does not open gets no answer (see Helpers.openRequest)
    Triauth.config.logger.error(err, err.data);
    stateRef.value = 'unopened';
    return;
  }

  try {
    const requestData = Helpers.parseChallenge(challengeString, 'attest');
    const {identifier, ext} = requestData;

    challenge = requestData.challenge;
    baseUrl = requestData.baseUrl;
    callbackUrl = requestData.callbackUrl;

    // Do the security checks for referrer
    Helpers.ensureReferrerMatch(baseUrl);

    identity = await Helpers.sessionIdentity(session, identifier, baseUrl);

    await db.patch('sessions', {id: session.id, lastUsedAt: Date.now()});

    // Double-check that the website entry in DB exists for the given session
    website = await db.find('websites', {id: session.websiteId, identityId:identity.id});
    if (!website) {
      throw new AppError('The referring website is not recognized', {sessionId:session.id, websiteId:session.websiteId, identityId:identity.id});
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

    // If there are any requested attestations present, start the loop that reads the responses of the verification providers
    if (Object.keys(requestedAttestRef.value).length > 0) {
      refreshVerificationsLoop();
    }

    // Extract the callbackMethod from ext
    callbackMethod = ext['callbackMethod'];

    stateRef.value = 'pending';

  } catch (err) {
    Triauth.config.logger.error(err, err.data);
    stateRef.value = 'error';
    errorMessageRef.value = err instanceof AppError ? err.message : 'An internal error has occurred';

  }
}

async function performVerification(attestId) {
  try {

    // Cleanup the verification started earlier for this attestation (if any)
    const previousVerification = requestedAttestRef.value[attestId].verification;
    if (previousVerification?.id) {
      requestedAttestRef.value[attestId].verification = undefined;
      await db.delete('verifications', previousVerification.id);
    }

    const url = new URL(requestedAttestRef.value[attestId].selectedProvider);

    // The ID is a one-time random value, which the provider sends back with its response
    const verification = await db.add('verifications', {
      id: Triauth.Helpers.randomString(24),
      identityId: identity.id,
      websiteId: website.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60e3
    });

    requestedAttestRef.value[attestId].verification = verification;

    url.searchParams.set('callbackUrl', window.location.origin + window.location.pathname + '#?verification=' + verification.id);
    url.searchParams.set('challenge', challengeDigest);

    window.open(url, '_blank', 'noopener');

  } catch (err) {
    Triauth.config.logger.error(err, err.data);
    stateRef.value = 'error';
    errorMessageRef.value = err instanceof AppError ? err.message : 'An internal error has occurred';

  }
}

async function refreshVerifications() {
  for (const [k,v] of Object.entries(requestedAttestRef.value)) {
    if (v.verification && !v.verification.response) {
      v.verification = await db.get('verifications', v.verification.id);
      if (v.verification.response === 'false') {
        v.verification.isVerified = false;

      } else if (v.verification.response) {

        // Verify the response - the verification is quite lax, as the client website will do the final proper verification
        const verifyRes = await Triauth.verify(challengeDigest, v.verification.response, {
          type: 'attest',
          actor: '',
          notBefore: pageLoadTimestamp - Triauth.config.maximalAllowedClientClockDrift,
          notAfter: Date.now() + Triauth.config.maximalAllowedClientClockDrift
        });

        // As on the website, the signature must come from one of the listed providers, by an identity at that provider's host
        v.verification.isVerified = verifyRes?.valid === true &&
          v.providers.includes(verifyRes.via) &&
          verifyRes.identifier.replace(/.+@/, '') === Triauth.Helpers.urlHost(verifyRes.via);
      }
    }
  }
}

let attestPollTimer = null;
async function refreshVerificationsLoop() {
  try {
    await refreshVerifications();
  } catch (err) {
    // e.g. a read aborted when the browser froze this tab while the provider was open; keep polling
    Triauth.config.logger.error(err);
  }
  attestPollTimer = setTimeout(refreshVerificationsLoop, 500);
}

function stopAttestPoll() {
  clearTimeout(attestPollTimer);
  attestPollTimer = null;
}
onUnmounted(stopAttestPoll);

// Cleans up the verifications of this page, and the expired ones
async function cleanupVerifications() {
  for (const [k,v] of Object.entries(requestedAttestRef.value)) {
    if (v.verification?.id) {
      await db.delete('verifications', v.verification.id);
    }
  }

  await db.sweepExpired('verifications');
}

function goBack() {
  window.history.back();
}

async function deny() {
  if (busyRef.value) return;
  busyRef.value = true;

  stopAttestPoll();
  await cleanupVerifications();

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
      signatures.push(v.verification.response);
    }

    const response = Triauth.MultiSignature.generate(...signatures);

    await cleanupVerifications();

    const {sealedResponse} = await Helpers.sealResponse(challenge, response);

    Helpers.sendResponse(callbackMethod, callbackUrl, sealedResponse);

  } catch (err) {
    // A dismissed prompt leaves the request as it was, ready to be approved again
    if (err instanceof CancelledError) {
      if (Object.keys(requestedAttestRef.value).length > 0) {
        refreshVerificationsLoop();
      }
      busyRef.value = false;
      return;
    }

    Triauth.config.logger.error(err, err.data);
    stateRef.value = 'error';
    errorMessageRef.value = err instanceof AppError ? err.message : 'An internal error has occurred';
    busyRef.value = false;
  }
}

</script>

<template>
  <div class="my-[10vw] md:my-[10vh] m-auto rounded-lg border border-gray-200 bg-white text-left shadow-md" style="max-width:min(90vw,640px);">
    <div :class="[stateRef === 'error' ? 'bg-red-600' : 'bg-blue-600']" class="p-5 text-white font-bold rounded-tl-lg rounded-tr-lg flex flex-row justify-between">
      <div class="w-6"><strong>⠕</strong></div>
      <div class="text-left flex-1">&nbsp;</div>
    </div>

    <div class="p-5 text-center" v-if="stateRef === 'verifying'">
      Verifying, please wait ...
    </div>

    <div class="p-5 flex flex-col gap-4 text-center" v-else-if="stateRef === 'unopened'">
      <div class="font-bold p-2">Attestation request could not be opened</div>
      <div class="text-sm p-2">Sign in to the website again, and then try again.</div>
      <div class="p-2" v-if="canGoBack"><Button @click="goBack()">Back to the website</Button></div>
      <div class="p-2" v-else>You can close this tab</div>
    </div>

    <div class="p-5 flex flex-col gap-4 text-center" v-else-if="stateRef === 'error'">
      <div class="font-bold p-2">Attestation request could not be processed</div>
      <div class="text-sm p-2 break-words">{{errorMessageRef}}</div>
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
                <VerifiedIcon v-if="val.verification?.isVerified"/>
                <CloseIcon class="fill-red-600" v-else-if="val.verification?.isVerified === false"/>
              </div>
              <div class="text-sm py-2 text-slate-800 flex justify-between" v-if="!val.verification?.isVerified">
                <Select v-model="val.selectedProvider" :options="val.providers" placeholder="Select verification provider" class="grow max-w-[65%]"/>
                <Button @click="performVerification(key)" class="font-normal" v-if="val.selectedProvider"><OpenInNewIcon class="fill-current" aria-hidden="true"/> Click to verify</Button>
              </div>
              <Message size="small" severity="error" variant="simple" v-if="val.verification?.isVerified === false">
                {{val.verification.response === 'false' ? 'The provider did not confirm this.' : 'This verification failed.'}}
                Try again, or select another provider.
              </Message>
            </div>
          </div>


          <div class="text-gray-500 text-sm mx-4 text-justify p-4">
            The labels and the list of third-party verification providers above were provided by the website.
            After clicking the verify button you will be directed to the selected verification provider's website on which you can finish the verification.
            We have no control over, and disclaim any responsibility for, the content, privacy policies, or practices of any third-party verification providers.
          </div>
      </div>

      <div class="p-2 bg-yellow-200 inline-block rounded text-gray-800 text-sm" v-if="!Object.values(requestedAttestRef).every((v) => v.verification?.isVerified)">Please complete the required verifications before you continue.</div>

      <div class="flex flex-col md:flex-row-reverse md:mx-4 gap-4 text-center justify-between mt-4">
        <Button @click="confirm()" :disabled="inCoolOffPeriodRef || busyRef || !Object.values(requestedAttestRef).every((v) => v.verification?.isVerified)" class="md:w-1/2">Confirm</Button>
        <Button variant="outlined" @click="deny" :disabled="busyRef" class="md:w-1/2">Deny</Button>
      </div>
    </div>

  </div>
</template>

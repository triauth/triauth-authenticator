<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<script setup>
import { ref } from 'vue';
import { Authenticator } from "../lib/authenticator.js";

import { db } from '../db/db.js'

import DraftIcon from "../../vendor/material-icons/Draft.vue";
import DocsIcon from '../../vendor/material-icons/Docs.vue';
import ImageIcon from "../../vendor/material-icons/Image.vue";
import AudioFileIcon from "../../vendor/material-icons/AudioFile.vue";
import VideoFileIcon from "../../vendor/material-icons/VideoFile.vue";
import CodeBlocksIcon from "../../vendor/material-icons/CodeBlocks.vue";

import {Helpers} from "../lib/helpers.js";
import {AppError} from "../lib/errors.js";

// One of 'verifying', 'error', 'pending', 'denied'
const stateRef = ref('verifying');

let challenge = null;
let baseUrl = null;
let identity = null;
let website = null;

let callbackMethod = 'POST';
let callbackUrl = null;

let message = null;

const attachmentsRef = ref([]);

const errorMessageRef = ref('');

const inCoolOffPeriodRef = ref(true);
setTimeout(() => inCoolOffPeriodRef.value = false, 1e3);

const busyRef = ref(false);

setup();

const ALLOWED_ATTACHMENT_CONTENT_TYPES = {
  'text/plain':           { ext: ['txt', 'md', ''], safe: true, viewable: true, icon: 'doc'   },
  'application/pdf':      { ext: ['pdf', ''],       safe: true, viewable: true, icon: 'doc'   },

  'application/json':     { ext: ['json'],          safe: true, viewable: true, icon: 'code'  },
  'application/xml':      { ext: ['xml'],           safe: true, viewable: false, icon: 'code'  },
  'text/xml':             { ext: ['xml'],           safe: true, viewable: false, icon: 'code'  },

  'image/jpeg':           { ext: ['jpg', 'jpeg'],   safe: true, viewable: true, icon: 'img'   },
  'image/gif':            { ext: ['gif'],           safe: true, viewable: true, icon: 'img'   },
  'image/png':            { ext: ['png'],           safe: true, viewable: true, icon: 'img'   },

  'audio/mpeg':           { ext: ['mp3'],           safe: true, viewable: true, icon: 'audio' },
  'audio/wav':            { ext: ['wav'],           safe: true, viewable: true, icon: 'audio' },

  'video/mp4':            { ext: ['mp4'],           safe: true, viewable: true, icon: 'video' },
  'video/webm':           { ext: ['webm'],          safe: true, viewable: true, icon: 'video' },

  'application/msword':   { ext: ['doc'], safe: false, viewable: false, icon: 'doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: ['docx'], safe: false, viewable: false, icon: 'doc' },
  'application/vnd.oasis.opendocument.text': { ext: ['odt'], safe: false, viewable: false, icon: 'doc' },

  'application/vnd.ms-excel': { ext: ['xls'], safe: false, viewable: false, icon: 'doc' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: ['xlsx'], safe: false, viewable: false, icon: 'doc' },
  'application/vnd.oasis.opendocument.spreadsheet': { ext: ['ods'], safe: false, viewable: false, icon: 'doc' }
};


async function setup() {
  try {
    const requestData = Helpers.parseRequest(window.location, 'sign');
    const {identifier, ext, hmac, challengeString} = requestData;

    challenge = requestData.challenge;
    baseUrl = requestData.baseUrl;
    callbackUrl = requestData.callbackUrl;

    // Do the security checks for referrer
    Helpers.ensureReferrerMatch(baseUrl);

    // Load the requested identity
    identity = await db.find('identities', {identifier});

    if (!identity) {
      throw new AppError(`A website tried to request a signature from ${challenge.identity.identifier} but this browser is not yet configured with this identifier.`, {identifier, baseUrl:baseUrl.href});
    }

    // Find the token that should be used with this request
    const token = await db.find('tokens', {type:'signToken', identityId:identity.id, baseUrl:baseUrl.href });

    if (!token || Helpers.tokenExpired(token)) {
      throw new AppError('Referring website is not allowed to request signatures', {identityId:identity.id, baseUrl:baseUrl.href});
    }

    // Do the security checks for hmac token
    await Helpers.ensureValidHmac(hmac, token.value, challengeString);

    await db.patch('tokens', {id: token.id, lastUsedAt: Date.now()});

    // Double-check that the website entry in DB exists for the given token, and that the website has permission
    website = await db.find('websites', {id: token.websiteId, identityId:identity.id});
    if (!website) {
      throw new AppError('Referring website is not allowed to request signatures', {tokenId:token.id, websiteId:token.websiteId, identityId:identity.id});
    }

    // Validate the message to be signed, as embedded in challenge.data.msg
    if (!Triauth.Validator.validateMessage(challenge.data.msg).valid){
      throw new AppError('challenge.data.msg validation failed', {message:challenge.data.msg});
    }
    message = challenge.data.msg;

    // Validate the attachments to be signed, as embedded in challenge.data.attachments
    if (Object.keys(challenge.data).includes('attachments') && !Triauth.Validator.validateAttachments(challenge.data.attachments).valid) {
      throw new AppError('challenge.data.attachments validation failed', {attachments:challenge.data.attachments});
    }

    // Extract the attachments information from challenge data into attachmentsRef
    for (const attachment of (challenge.data.attachments || [])) {
      attachmentsRef.value.push({
        name: attachment.name,
        sourceUrl: attachment.sourceUrl,
        expectedSha256: attachment.sha256
      });
    }

    // Extract the callbackMethod from ext
    callbackMethod = ext['callbackMethod'];

    stateRef.value = 'pending';

    // Start fetching the attachments
    await fetchAttachments();

  } catch (err) {
    Triauth.config.logger.error(err, err.data);
    stateRef.value = 'error';
    errorMessageRef.value = err instanceof AppError ? err.message : 'Internal error has occurred';

  }
}

async function fetchAttachments() {
  for (const attachment of attachmentsRef.value) {
    fetchAttachment(attachment);
  }
}

async function fetchAttachment(attachment) {
  Triauth.config.logger.info('Fetching attachment', {attachment});
  const contentArray = await Helpers.safeFetch(attachment.sourceUrl, attachment, {timeout: 15 * 60e3, maxSize: 25*1024*1024, fileName: attachment.name, allowedContentTypes: ALLOWED_ATTACHMENT_CONTENT_TYPES});

  if(contentArray) {
    attachment.sha256 = await Helpers.sha256Hexdigest(contentArray);

    if (attachment.expectedSha256 && attachment.sha256 !== attachment.expectedSha256) {
      Triauth.config.logger.error('Attachment', attachment.name, 'fingerprint mismatch -', 'expected', attachment.expectedSha256, 'but got', attachment.sha256);
      attachment.error = `File fingerprint mismatch. The content of the downloaded file is different from the one expected by the website.`;

    } else {
      attachment.blob = new Blob([contentArray], { type: attachment.contentType });
      attachment.href = URL.createObjectURL(attachment.blob);

    }

  }
}

function humanizeBytesize(bytesize) {
  const mbSize = (Math.ceil(100 * (bytesize / (1024 * 1024))) / 100).toFixed(2);
  return `${mbSize} MB`;
}

function deny() {
  if (busyRef.value) return;
  busyRef.value = true;

  stateRef.value = 'denied';

  if (Helpers.referrerMatchesCallback(callbackUrl)) {
    Helpers.sendResponse(callbackMethod, callbackUrl, 'false');

  }
}

async function confirm() {
  if (busyRef.value) return;
  busyRef.value = true;

  try {
    const authenticator = new Authenticator(identity, identity.signers);
    const signature = await authenticator.process('sign', baseUrl.href, String(message), {
      attachments: attachmentsRef.value.map((a) => ({name: a.name, sha256: a.sha256}))
    });

    Helpers.sendResponse(callbackMethod, callbackUrl, signature);

  } catch (err) {
    Triauth.config.logger.error(err, err.data);
    stateRef.value = 'error';
    errorMessageRef.value = err instanceof AppError ? err.message : 'Internal error has occurred';
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

    <div class="p-5 flex flex-col gap-4 text-center" v-else-if="stateRef === 'error'">
      <div class="font-bold p-2">Signature request could not be processed</div>
      <div class="text-sm p-2">{{errorMessageRef}}</div>
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
          to approve and sign the following:
        </div>
      </div>

      <div>
        <div class="text-xs group-separator p-2">
          Message
        </div>

        <div class="text-gray-800 text-sm my-3 mx-4 text-justify p-5 bg-gray-50 rounded-2xl">
          <pre class="text-wrap">{{message}}</pre>
        </div>
      </div>

      <div>
        <div class="text-xs group-separator p-2">
          Attachments <span class="font-mono">({{attachmentsRef.length}})</span>
        </div>

        <ul class="p-4 text-left">
          <li class="flex border-2 rounded-lg p-4 border-gray-200 mb-5" v-for="attachment of attachmentsRef">
            <div>
              <DocsIcon v-if="attachment.icon === 'doc'"/>
              <ImageIcon v-else-if="attachment.icon === 'img'"/>
              <AudioFileIcon v-else-if="attachment.icon === 'audio'"/>
              <VideoFileIcon v-else-if="attachment.icon === 'video'"/>
              <CodeBlocksIcon v-else-if="attachment.icon === 'code'"/>
              <DraftIcon v-else/>
            </div>
            <div class="flex flex-col mx-2 grow">
              <a :href="attachment.href" :download="attachment.name" target="_blank" rel="noopener">{{attachment.name}}</a>

              <div class="text-sm text-gray-500 flex gap-5 mt-2 text-red-500" v-if="attachment.error">
                {{attachment.error}}
              </div>

              <div class="text-sm text-gray-500 flex flex-col gap-2 mt-1" v-else-if="attachment.sha256">
                <div class="text-xs my-1 flex gap-2 items-center mb-2">
                  <div class="grow break-all">{{ attachment.sourceUrl }}</div>
                  <div class="shrink-0">{{ humanizeBytesize(attachment.receivedBytes) }}</div>
                </div>

                <div class="flex flex-col">
                  <div class="p-4 my-4  bg-yellow-200 inline-block rounded text-gray-800 text-sm rounded" v-if="!attachment.safe">
                    <strong>Less secure file type</strong><br/>
                    This file may contain macros or executable scripts.<br/>
                    Please scan it with antivirus before opening.
                  </div>

                  <div class="text-right">
                    &nbsp;
                    <Button as="a" :href="attachment.href" target="_blank" rel="noopener" size="small" severity="secondary" variant="outlined" v-if="attachment.viewable">View</Button>
                    &nbsp;
                    <Button as="a" :href="attachment.href" target="_blank" rel="noopener" :download="attachment.name" size="small" variant="outlined">Download</Button>
                  </div>
                </div>
              </div>

              <div class="text-xs text-gray-500 flex gap-5 mt-2" v-else-if="attachment.receivedBytes > 1">
                <div class="grow">
                  <ProgressBar style="height:6px;margin-top:3px;" :value="Math.round((attachment.receivedBytes / attachment.contentLength) * 100)" v-if="attachment.contentLength">&nbsp;</ProgressBar>
                  <ProgressBar mode="indeterminate" style="height:6px;margin-top:4px;" v-else></ProgressBar>
                </div>
                <div></div>
                <div style="min-width:150px;" class="font-mono text-right">
                  <span style="display:inline-block;">
                    {{ humanizeBytesize(attachment.receivedBytes) }}
                    <span v-if="attachment.contentLength">/ {{ humanizeBytesize(attachment.contentLength) }}</span>
                  </span>
                </div>
              </div>

              <div class="text-xs text-gray-500 flex gap-5 mt-2" v-else>
                Preparing download ...
              </div>

            </div>
          </li>
        </ul>
      </div>

      <div class="text-gray-500 text-sm mx-4 text-justify p-4 pt-0">
        The message and any attachments above were provided by the specified website.
        Do not open attachments from websites that you do not trust.
        Download and save any relevant attachments before approving, because they may not be available again.
      </div>

      <div class="flex flex-col md:flex-row-reverse md:mx-4 gap-4 text-center justify-between mt-4">
        <Button @click="confirm()" :disabled="inCoolOffPeriodRef || busyRef || !attachmentsRef.every((v) => v.sha256 && !v.error)" class="md:w-1/2">Approve and sign</Button>
        <Button variant="outlined" @click="deny" :disabled="busyRef" class="md:w-1/2">Deny</Button>
      </div>
    </div>

  </div>

</template>

<style scoped>
.group-separator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  color: #666;
  cursor: pointer;
  user-select: none;
}

.group-separator::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #ddd;
}
</style>

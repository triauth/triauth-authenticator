<!--
  Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
  Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
  SPDX-License-Identifier: Elastic-2.0
-->

<script setup>
import {ref, computed} from "vue";
import {TERMS_URL, PRIVACY_URL, LEGAL_MISCONFIGURED} from "../lib/legal.js";

const consentRequired = Boolean(TERMS_URL || PRIVACY_URL);

const termsCheckbox = ref(false);

const consentGiven = computed(() => !consentRequired || termsCheckbox.value?.[0] === 'yes');

const getStarted = () => {
  if (!consentGiven.value) return;

  window.localStorage.setItem('termsAcceptedAt', Date.now());
  if (TERMS_URL) window.localStorage.setItem('acceptedTermsUrl', TERMS_URL);
  if (PRIVACY_URL) window.localStorage.setItem('acceptedPrivacyUrl', PRIVACY_URL);

  window.location = '#setup';
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
</script>

<template>
  <div class="m-auto rounded-lg border border-gray-200 bg-white text-left shadow-md" style="margin-top:10vh;max-width:min(90vw,640px);width:min(90vw,640px);">
    <div class="p-5 pl-5 pr-5 bg-blue-600 text-white font-bold rounded-tl-lg rounded-tr-lg flex flex-row justify-between select-none">
      <div class="size-5 text-l text-center"><strong>⠕</strong></div>
      <div class="flex-2 pr-5 pl-5">triauth</div>
      <div class="size-5"></div>
    </div>

    <div class="p-9 leading-relaxed" style="max-width:720px;">
      <!-- The ⠕ brand glyph pops in alone (left column first, then the "play" point), then shrinks
           while a "Sign in with triauth" button grows around it. The button gets pressed once, and
           the rest of the page rises in as if that press had caused it, while the button recedes.
           The receded button and the full page are the resting state, so without motion everything
           shows at once. The button is an illustration, not a control.
           viewBox min-x is -8 so the lone mark's center of mass (x=40) sits on the centered axis -->
      <div class="ta-stage mt-5 mb-10 flex justify-center items-center">
        <div class="ta-button" aria-hidden="true">
          <svg class="ta-mark" viewBox="-8 0 96 128">
            <rect class="ta-dot" style="--d:.05s" x="14.5" y="10.5" width="19" height="19" rx="2" fill="#000000"/>
            <rect class="ta-dot" style="--d:.05s" x="14.5" y="98.5" width="19" height="19" rx="2" fill="#000000"/>
            <rect class="ta-dot" style="--d:.2s"  x="62.5" y="54.5" width="19" height="19" rx="2" fill="#000000"/>
          </svg>
          <span class="ta-label-clip"><span class="ta-label">Sign in with triauth</span></span>
        </div>
      </div>

      <div class="text-center">
        <h2 class="font-bold text-2xl mb-5 ta-rise" style="--d:1.4s">Meet your new sign-in button</h2>
        <p class="font-medium ta-rise" style="--d:1.5s">Link your triauth identifier to this device and leave passwords behind.</p>
      </div>

      <div class="ta-rise" style="--d:1.6s">
        <!-- Misconfigured official instance -->
        <p v-if="LEGAL_MISCONFIGURED" class="mt-10 text-center text-sm text-red-600">
          Setup is unavailable right now.
          Please try again later or write to support@triauth.org.
        </p>

        <template v-else>
          <div v-if="consentRequired" class="flex items-start gap-2 mt-10">
            <Checkbox v-model="termsCheckbox" inputId="termsAccepted" name="termsAccepted" value="yes" class="mt-1" />
            <label for="termsAccepted">
              I have read and agree to the
              <a v-if="TERMS_URL" :href="TERMS_URL" target="_blank" rel="noopener noreferrer" class="underline">Terms of Service</a><template v-if="TERMS_URL && PRIVACY_URL"> and </template><a v-if="PRIVACY_URL" :href="PRIVACY_URL" target="_blank" rel="noopener noreferrer" class="underline">Privacy Policy</a>.
            </label>
          </div>

          <div class="text-center mt-8">
            <Button :disabled="!consentGiven" style="width:75%;" @click.prevent="getStarted">Get started</Button>
          </div>
        </template>

        <p class="text-xs text-gray-400 mt-8 text-justify leading-5">
          Triauth Authenticator is provided “as is”, without warranty of any kind; to the maximum
          extent permitted by law, its authors accept no liability for any loss or damage arising
          from its use. See the <a href="/LICENSE.txt" class="underline">LICENSE.txt</a> for the specific language governing permissions and
          limitations under the License.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The lone mark's height, reserved so nothing below moves while the button forms */
.ta-stage { height: 67px; }

/* Resting state: the finished button, receded to gray so it does not compete with the headline */
.ta-button {
  display: inline-grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  height: 46px;
  padding: 0 18px 0 13px;
  border: 1.5px solid #4b5563;
  border-radius: 6px;
  background: #ffffff;
  color: #4b5563;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
  user-select: none;
  transform: scale(.96);
}
.ta-mark { display: block; width: 16px; height: auto; }
.ta-dot { fill: #4b5563; } /* the SVG's own black is what the pop plays in */
.ta-label-clip { overflow: hidden; min-width: 0; }
.ta-label { display: block; width: max-content; padding-left: 10px; }

/* The sequence: pop (0 to .55s), form (.6 to 1.05s), press (1.2 to 1.45s), then the rest of the
   page rises in while the button recedes (1.4 to 1.95s) */
@media (prefers-reduced-motion: no-preference) {
  .ta-dot {
    transform-box: fill-box;
    transform-origin: center;
    animation: ta-pop .35s ease-out both, ta-ink .5s ease-out both;
    animation-delay: var(--d), 1.45s;
  }
  .ta-mark { animation: ta-shrink .45s cubic-bezier(.4, 0, .2, 1) both .6s; }
  .ta-button {
    animation: ta-grow .45s cubic-bezier(.4, 0, .2, 1) both .6s,
               ta-body 1.3s ease-out both .65s,
               ta-press .25s ease-in-out backwards 1.2s;
  }
  .ta-label { animation: ta-fade .35s ease-out both .75s; }
  .ta-rise {
    animation: ta-rise .4s ease-out both;
    animation-delay: var(--d);
  }
}

@keyframes ta-pop {
  0%   { transform: scale(0); opacity: 0; }
  70%  { transform: scale(1.18); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes ta-ink { from { fill: #000000; } to { fill: #4b5563; } }
@keyframes ta-shrink { from { width: 50px; } to { width: 16px; } }
/* The label column grows from nothing to its own width, so nothing has to be measured */
@keyframes ta-grow { from { grid-template-columns: auto 0fr; } to { grid-template-columns: auto 1fr; } }
/* The body has formed by 31%, keeps its dark ink through the press, then recedes */
@keyframes ta-body {
  0%   { padding: 0; height: 67px; background-color: transparent; border-color: transparent; color: #111827; transform: scale(1); }
  31%  { padding: 0 18px 0 13px; height: 46px; background-color: #ffffff; border-color: #111827; }
  62%  { border-color: #111827; color: #111827; transform: scale(1); }
  100% { border-color: #4b5563; color: #4b5563; transform: scale(.96); }
}
@keyframes ta-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ta-press { 0%, 100% { transform: scale(1); } 50% { transform: scale(.955); } }
@keyframes ta-rise {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}
</style>

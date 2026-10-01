/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

// Shortcut-icon fetcher, run as a dedicated worker by the auth consent page (see lib/shortcutIcon.js).
//
// It downloads one image with a hardened GET, re-encodes it as a small PNG when the engine can decode
// images off the main thread, and hands the page a data URL - the page stores a string, nothing else.
//
// Self-contained on purpose (no imports)

// PNG and JPEG only, recognized by their leading bytes: image decoders sniff the content and ignore the
// declared type, so the Content-Type header alone would not limit which decoder runs.
const IMAGE_SIGNATURES = {
  'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'image/jpeg': [0xFF, 0xD8, 0xFF]
};

// Edge of the normalized icon, in pixels - plenty for a home-screen tile on a high-density screen
const ICON_SIZE = 128;

self.onmessage = async ({data}) => {
  try {
    const {url, maxBytes, timeout} = data || {};
    self.postMessage({ok: true, dataUrl: await fetchIcon(url, maxBytes, timeout)});
  } catch (err) {
    self.postMessage({ok: false, error: String(err?.message || err)});
  }
};

async function fetchIcon(url, maxBytes, timeout) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    throw new Error('Unsupported icon URL');
  }

  if (!(maxBytes > 0) || !(timeout > 0)) {
    throw new Error('Invalid limits');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const signature = Object.hasOwn(IMAGE_SIGNATURES, contentType) ? IMAGE_SIGNATURES[contentType] : null;
    if (!signature) {
      throw new Error(`Unsupported content type "${contentType}"`);
    }

    const declaredLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (declaredLength > maxBytes) {
      throw new Error('Icon is too large');
    }

    const bytes = await readCapped(response.body, maxBytes);
    if (bytes.length < signature.length || !signature.every((byte, i) => bytes[i] === byte)) {
      throw new Error('Content does not match its declared image type');
    }

    // Nothing is ever stored as received: the image either re-encodes as a PNG or it is not an icon
    const normalized = await normalize(new Blob([bytes], {type: contentType}));
    if (!normalized) {
      throw new Error('Icon could not be decoded');
    }
    return normalized;

  } finally {
    clearTimeout(timer);
  }
}

// Reads the whole body, aborting as soon as it exceeds maxBytes (a Content-Length header is optional
// and may be wrong).
async function readCapped(body, maxBytes) {
  const reader = body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;

    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error('Icon is too large');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

// Re-encodes the image as an ICON_SIZE x ICON_SIZE PNG (fitted, centered, transparent padding).
// Decoding happens here, once and off the main thread, so an oversized or hostile bitmap costs this
// worker and never the home screen, and what gets stored is always a plain PNG of bounded size.
// Returns null where the engine cannot decode the image in a worker.
async function normalize(blob) {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return null;
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }

  try {
    if (!(bitmap.width > 0 && bitmap.height > 0)) {
      return null;
    }

    const scale = Math.min(ICON_SIZE / bitmap.width, ICON_SIZE / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, (ICON_SIZE - width) / 2, (ICON_SIZE - height) / 2, width, height);

    return await toDataUrl(await canvas.convertToBlob({type: 'image/png'}));

  } finally {
    bitmap.close();
  }
}

function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not encode the icon'));
    reader.readAsDataURL(blob);
  });
}

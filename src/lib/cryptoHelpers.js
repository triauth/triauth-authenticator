/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

class CryptoHelpers {

  static spkiToRaw(spkiDer) {
    // P-256 SPKI is exactly 91 bytes: 26-byte header + 65-byte uncompressed point
    const bytes = new Uint8Array(spkiDer);
    return bytes.slice(-65); // last 65 bytes are 0x04 || x (32) || y (32)
  }

  // Fallback for browsers whose AuthenticatorAttestationResponse lacks getPublicKey()
  // (e.g. Safari < 15.5): digs the ES256 public key out of the attestation object.
  // Minimal parsing in the spirit of the helpers here, not a general CBOR decoder -
  // it relies on the CTAP2 canonical encoding every authenticator must produce.
  static attestationToRawP256(attestationObject) {
    const bytes = new Uint8Array(attestationObject);

    // Locate the 'authData' map key (CBOR text string: 0x68 'authData') and read the
    // byte string that follows it (0x40-0x57 tiny, 0x58/0x59 = 1/2-byte length prefix).
    const key = [0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61];
    let i = bytes.findIndex((_, idx) => key.every((b, j) => bytes[idx + j] === b));
    if (i < 0) throw new Error('authData not found in attestationObject');
    i += key.length;

    let len;
    if (bytes[i] >= 0x40 && bytes[i] <= 0x57) { len = bytes[i] - 0x40; i += 1; }
    else if (bytes[i] === 0x58) { len = bytes[i + 1]; i += 2; }
    else if (bytes[i] === 0x59) { len = (bytes[i + 1] << 8) | bytes[i + 2]; i += 3; }
    else throw new Error('Unsupported authData encoding');
    const authData = bytes.slice(i, i + len);

    // authData: rpIdHash(32) + flags(1) + counter(4) + aaguid(16) + credIdLen(2) + credId + COSE key
    const credIdLen = (authData[53] << 8) | authData[54];
    const cose = authData.slice(55 + credIdLen);

    // COSE ES256 key coordinates: <label> 0x58 0x20 <32 bytes>, labels -2 (0x21) = x
    // and -3 (0x22) = y. Canonical order puts x before y, so scan for y after x to
    // avoid false matches inside x's random bytes.
    const coord = (label, from) => {
      for (let j = from; j <= cose.length - 35; j++) {
        if (cose[j] === label && cose[j + 1] === 0x58 && cose[j + 2] === 0x20) {
          return {value: cose.slice(j + 3, j + 35), end: j + 35};
        }
      }
      throw new Error('Coordinate not found in COSE key');
    };
    const x = coord(0x21, 0);
    const y = coord(0x22, x.end);

    const out = new Uint8Array(65);
    out[0] = 0x04;
    out.set(x.value, 1);
    out.set(y.value, 33);
    return out;
  }

  static derToP1363(derSig) {
    const buf = new Uint8Array(derSig);
    // DER: 0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
    let offset = 2; // skip SEQUENCE tag + length
    if (buf[1] & 0x80) offset += (buf[1] & 0x7f); // long-form length (rare)

    offset++; // 0x02 (INTEGER tag for r)
    const rLen = buf[offset++];
    const r = buf.slice(offset, offset + rLen);
    offset += rLen;

    offset++; // 0x02 (INTEGER tag for s)
    const sLen = buf[offset++];
    const s = buf.slice(offset, offset + sLen);

    // Pad/trim each to exactly 32 bytes
    const out = new Uint8Array(64);
    out.set(r.length > 32 ? r.slice(r.length - 32) : r, 32 - Math.min(r.length, 32));
    out.set(s.length > 32 ? s.slice(s.length - 32) : s, 64 - Math.min(s.length, 32));
    return out;
  }

}

export default CryptoHelpers;

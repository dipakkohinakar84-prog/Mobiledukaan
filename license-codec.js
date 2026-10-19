// Shared licence codec for Bill Pro device-bound keys (no JSX, no DOM).
// Used by the seller tool (issue-key.js) and the app (mobile-dukaan_2.jsx).
// Crockford base32 (uppercase, no I/L/O/U confusables) matches the device-ID
// alphabet, stays readable over the phone, and survives case changes.

export const LICENSE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const DEVICE_ID_RE = /^[0-9A-Z]{12}$/;

// A v2 device-bound body is always 12 device chars + 103 signature chars.
export const V2_BODY_LEN = 115;
export const V2_SIG_LEN = 103;

export const b32encode = (bytes) => {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += LICENSE_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) out += LICENSE_ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
};

export const b32decode = (str) => {
  const out = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of String(str || '')) {
    const v = LICENSE_ALPHABET.indexOf(ch);
    if (v < 0) return null;
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >>> bits) & 255);
    }
  }
  return new Uint8Array(out);
};

export const normalizeDeviceId = (raw) => {
  const compact = String(raw || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/^BP/, '')
    .replace(/I/g, '1')
    .replace(/L/g, '1')
    .replace(/O/g, '0');
  return DEVICE_ID_RE.test(compact) ? compact : '';
};

export const groupsOf = (text, size) =>
  (String(text || '').match(new RegExp(`.{1,${size}}`, 'g')) || []).join('-');

import crypto from 'node:crypto';
import {
  b32encode, b32decode, normalizeDeviceId, groupsOf, V2_BODY_LEN, V2_SIG_LEN,
} from './license-codec.js';

const subtle = crypto.webcrypto.subtle;
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const buildKey = (deviceId, sigBytes) => `BP-${groupsOf(deviceId + b32encode(sigBytes), 5)}`;
const splitKey = (key) => {
  const body = key.slice(3).replace(/-/g, '');
  return { deviceId: body.slice(0, 12), sigChars: body.slice(12) };
};
const verifyWith = async (key, deviceId, publicJwk) => {
  const { deviceId: keyDevice, sigChars } = splitKey(key);
  if (keyDevice !== deviceId) return 'device-mismatch';
  const sigBytes = b32decode(sigChars);
  if (!sigBytes || sigBytes.length !== 64) return 'malformed';
  const pub = await subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, pub, sigBytes, new TextEncoder().encode(keyDevice),
  );
  return ok ? 'valid' : 'bad-signature';
};

// 1. Codec round-trip over random 64-byte signatures.
{
  let ok = true;
  for (let i = 0; i < 25; i++) {
    const raw = crypto.randomBytes(64);
    const back = b32decode(b32encode(raw));
    if (!back || back.length !== 64 || !raw.equals(Buffer.from(back))) { ok = false; break; }
  }
  check('crockford round-trip x25', ok);
}

// 2. Device ID normalization.
check('device normalize', normalizeDeviceId('bp-abcd-1234-efgh') === 'ABCD1234EFGH');
check('device rejects junk', normalizeDeviceId('BOGUS') === '' && normalizeDeviceId('') === '');
check('v2 lengths', V2_BODY_LEN === 115 && V2_SIG_LEN === 103, `${V2_BODY_LEN}/${V2_SIG_LEN}`);

// 3. Throwaway-keypair round-trip (proves the algorithm, not the root).
{
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { format: 'jwk' },
    privateKeyEncoding: { format: 'jwk' },
  });
  const deviceId = 'ABCD1234EFGH';
  const priv = crypto.createPrivateKey({ key: privateKey, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(deviceId, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' });
  const key = buildKey(deviceId, sig);
  check('key shape', key.startsWith('BP-') && key.slice(3).replace(/-/g, '').length === 115, `len=${key.length}`);
  check('accept on matching device', (await verifyWith(key, deviceId, publicKey)) === 'valid');
  check('reject on other device', (await verifyWith(key, 'ZZZZ9999YYYY', publicKey)) === 'device-mismatch');
  let tamperAt = 20;
  while (tamperAt < key.length && (key[tamperAt] === '-' || tamperAt < 18)) tamperAt += 1;
  const tampered = key.slice(0, tamperAt) + (key[tamperAt] === 'A' ? 'B' : 'A') + key.slice(tamperAt + 1);
  check('reject tampered signature', (await verifyWith(tampered, deviceId, publicKey)) === 'bad-signature');
  check('reject truncated key', (await verifyWith(key.slice(0, 60), deviceId, publicKey)) !== 'valid');
}

// 4. Interop with the real seller root (public key is public; device is a dummy).
{
  const PROD_PUBLIC_JWK = {
    kty: 'EC',
    x: 'H1tXo23mh0rijU4sEwP-4ot342mr95x4I4jGvTBrSqc',
    y: 'O2Nh9S_BNkqqwcx9Eu5vT2vhUKf1TUyKjyXVftaJta4',
    crv: 'P-256',
  };
  const prodKey = 'BP-ABCD1-234EF-GH8CV-5W0NQ-NC7NF-Y7TBA-C876F-EX856-TX82W-BAH3B-RZRDY-MG575-DZWEK-9XA9M-5S73W-3HART-18C5H-GV3W7-PQ4VV-37FS2-99KWB-JSK9A-YEHF8';
  check('production key verifies', (await verifyWith(prodKey, 'ABCD1234EFGH', PROD_PUBLIC_JWK)) === 'valid');
  check('production key bound to device', (await verifyWith(prodKey, 'QQQQ1111WWWW', PROD_PUBLIC_JWK)) === 'device-mismatch');
  const exposedOldKey = 'BP-ABCD1-234EF-GH1W7-BK9JC-HRSV9-F8HJ4-7VXR1-6QY0S-2PYPQ-4FNX7-DXGFF-4E698-ZDJ9A-HWR6W-7G0WT-YABT1-2CWKZ-M1Z3G-VJ168-QH923-3B1ZQ-8QQHH-KQW70';
  check('old production key rejected by rotated root', (await verifyWith(exposedOldKey, 'ABCD1234EFGH', PROD_PUBLIC_JWK)) === 'bad-signature');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/**
 * Bill Pro device-bound licence - one-time keypair setup (SELLER PC ONLY).
 *
 *   node generate-license-keypair.js
 *
 * Creates bill-pro-license-private.jwk next to this script (gitignored - it
 * must NEVER be committed, emailed, or shipped inside the app) and prints the
 * public JWK to paste into mobile-dukaan_2.jsx as BILL_PRO_PUBLIC_JWK.
 *
 * BACK UP bill-pro-license-private.jwk (USB stick, second copy) THE SAME DAY.
 * Losing it means no new device-bound keys can ever be issued, and every
 * BP- key already sold stops being re-issuable.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PRIVATE_JWK = path.join(ROOT, 'bill-pro-license-private.jwk');

if (fs.existsSync(PRIVATE_JWK)) {
  console.error('Refusing: bill-pro-license-private.jwk already exists.');
  console.error('Delete it by hand if you truly intend to rotate the licence root');
  console.error('(rotating invalidates every BP- key issued under the old root).');
  process.exit(1);
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { format: 'jwk' },
  privateKeyEncoding: { format: 'jwk' },
});

fs.writeFileSync(PRIVATE_JWK, JSON.stringify(privateKey, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });

console.log('Private key saved to bill-pro-license-private.jwk (KEEP SECRET, BACK UP NOW).');
console.log('');
console.log('Paste this public JWK into mobile-dukaan_2.jsx as BILL_PRO_PUBLIC_JWK:');
console.log('');
console.log(JSON.stringify(publicKey));
console.log('');
console.log('Next: node issue-key.js BP-XXXX-XXXX-XXXX');

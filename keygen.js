/**
 * PhoneDukaan License Key Generator
 * Run once: node keygen.js
 *
 * This script:
 *  1. Generates 500 unique license keys (PD-XXXX-XXXX-XXXX)
 *  2. SHA-256 hashes each key using Node.js crypto
 *  3. Writes keys.txt with all plain-text keys (keep private!)
 *  4. Auto-patches mobile-dukaan_2.jsx — replaces the HASHES_PLACEHOLDER
 *     with the real Set of hashes so the app can validate keys offline
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Charset: no I, O, 0, 1 to avoid visual confusion
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function seg() {
  return Array.from({ length: 4 }, () =>
    CHARSET[Math.floor(Math.random() * CHARSET.length)]
  ).join('');
}

// Generate 500 unique keys
const keys = new Set();
while (keys.size < 500) {
  keys.add(`PD-${seg()}-${seg()}-${seg()}`);
}
const keyList = [...keys];

// SHA-256 hash each key
const hashes = keyList.map(k =>
  crypto.createHash('sha256').update(k).digest('hex')
);

// Write keys.txt
const keysFile = path.join(__dirname, 'keys.txt');
const keysContent = [
  '# PhoneDukaan License Keys — 500 Lifetime Keys',
  '# Generated: ' + new Date().toISOString().slice(0, 10),
  '# KEEP THIS FILE PRIVATE. Distribute one key per customer.',
  '# Format: PD-XXXX-XXXX-XXXX',
  '',
  ...keyList,
].join('\n');
fs.writeFileSync(keysFile, keysContent, 'utf8');
console.log('✓ keys.txt written with 500 keys');

// Build the hashes array string to inject into source
const hashesArrayStr = hashes.map(h => `  "${h}"`).join(',\n');
const replacement = `new Set([\n${hashesArrayStr}\n])`;

// Patch mobile-dukaan_2.jsx — replace the placeholder
const srcFile = path.join(__dirname, 'mobile-dukaan_2.jsx');
let src = fs.readFileSync(srcFile, 'utf8');

const PLACEHOLDER = 'new Set(["__HASHES_PLACEHOLDER__"])';
if (!src.includes(PLACEHOLDER)) {
  console.error('ERROR: Placeholder not found in mobile-dukaan_2.jsx.');
  console.error('Make sure the source file contains: ' + PLACEHOLDER);
  process.exit(1);
}

src = src.replace(PLACEHOLDER, replacement);
fs.writeFileSync(srcFile, src, 'utf8');
console.log('✓ mobile-dukaan_2.jsx patched with 500 hashes');
console.log('\nDone! You can now run: npm run dev');
console.log('Distribute keys from keys.txt — one per customer.');

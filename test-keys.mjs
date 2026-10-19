import crypto from 'node:crypto';
import fs from 'node:fs';

const hashModule = fs.readFileSync('license-keys.js', 'utf8');
const hashes = new Set(hashModule.match(/[0-9a-f]{64}/g) || []);
const keys = fs.readFileSync('keys.txt', 'utf8').split(/\r?\n/).filter((line) => line.startsWith('PD-'));

let pass = 0;
let fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };

ok('hash count is 5000', hashes.size === 5000);
ok('key count is 5000', keys.length === 5000);
ok('keys unique', new Set(keys).size === 5000);
ok('key format', keys.every((k) => /^PD-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k)));
ok('no look-alike chars', keys.every((k) => !/[IO01]/.test(k.slice(3))));

const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
ok('every key hashes into the bundled set', keys.every((k) => hashes.has(sha(k))));

// Mirrors normalizeBillProKey() in mobile-dukaan_2.jsx
const normalizeBillProKey = (value = '') => {
  const compact = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let body = '';
  if (compact.length === 14 && compact.startsWith('PD')) body = compact.slice(2);
  else if (compact.length === 12) body = compact;
  if (!/^[A-Z0-9]{12}$/.test(body)) return '';
  return `PD-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
};

const sample = keys[0];
ok('lowercase accepted', normalizeBillProKey(sample.toLowerCase()) === sample);
ok('spaces accepted', normalizeBillProKey(sample.replace(/-/g, ' ')) === sample);
ok('bare body accepted', normalizeBillProKey(sample.replace('PD-', '')) === sample);
ok('padding junk rejected', normalizeBillProKey('hello') === '');
ok('too short rejected', normalizeBillProKey('PD-ABCD-EFGH') === '');

const tampered = sample.slice(0, -1) + (sample.at(-1) === 'Z' ? 'A' : 'Z');
ok('tampered key not in set', !hashes.has(sha(tampered)));
ok('random key not in set', !hashes.has(sha('PD-ZZZZ-ZZZZ-ZZZZ')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

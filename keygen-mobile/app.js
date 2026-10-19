// PhoneDukaan KeyGen (mobile) — seller-side licence issuer. Offline only.
// Private root lives in this origin's localStorage; nothing is uploaded.
import { normalizeDeviceId, b32encode, groupsOf } from './license-codec.js';

const PUBLIC_JWK = {
  kty: 'EC',
  x: 'H1tXo23mh0rijU4sEwP-4ot342mr95x4I4jGvTBrSqc',
  y: 'O2Nh9S_BNkqqwcx9Eu5vT2vhUKf1TUyKjyXVftaJta4',
  crv: 'P-256',
};
const ROOT_LS = 'keygen_root_v1';
const PIN_LS = 'keygen_pin_v1';
const LOG_LS = 'keygen_log_v1';
const LOG_MAX = 200;

const $ = (id) => document.getElementById(id);
const loadJSON = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } };
const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };

const show = (id) => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
  $(id).classList.add('on');
};
const fail = (id, msg) => { const e = $(id); e.textContent = msg; e.style.display = 'block'; };
const clearFail = (id) => { $(id).style.display = 'none'; };

const getRoot = () => {
  try {
    const r = JSON.parse(localStorage.getItem(ROOT_LS) || 'null');
    return r && r.kty === 'EC' && r.d && r.x === PUBLIC_JWK.x && r.y === PUBLIC_JWK.y ? r : null;
  } catch { return null; }
};

// ── setup: root import ──────────────────────────────────────────────
$('rootfile').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { $('roottext').value = String(rd.result || ''); clearFail('setuperr'); };
  rd.readAsText(f);
  e.target.value = '';
});
$('savesoot').addEventListener('click', () => {
  clearFail('setuperr');
  let parsed = null;
  try { parsed = JSON.parse($('roottext').value.trim()); } catch { parsed = null; }
  if (!parsed || parsed.kty !== 'EC' || !parsed.d || !parsed.x || !parsed.y) {
    fail('setuperr', 'That is not a valid private licence root. Load bill-pro-license-private.jwk.');
    return;
  }
  if (parsed.x !== PUBLIC_JWK.x || parsed.y !== PUBLIC_JWK.y) {
    fail('setuperr', 'This root does not match the app licence key. Use the root the shop app was built with.');
    return;
  }
  saveJSON(ROOT_LS, parsed);
  $('roottext').value = '';
  boot();
});

// ── PIN gate ────────────────────────────────────────────────────────
let pinMode = 'setup';
$('pingo').addEventListener('click', () => {
  clearFail('pinerr');
  const pin = localStorage.getItem(PIN_LS) || '';
  const a = $('pin1').value.replace(/\D/g, '').slice(0, 4);
  if (pinMode === 'unlock') {
    if (a === pin && pin) { $('pin1').value = ''; enterIssue(); }
    else fail('pinerr', 'Wrong PIN. Try again.');
    return;
  }
  const b = $('pin2').value.replace(/\D/g, '').slice(0, 4);
  if (!/^\d{4}$/.test(a) || a !== b) { fail('pinerr', 'Enter the same 4-digit PIN twice.'); return; }
  try { localStorage.setItem(PIN_LS, a); } catch { }
  $('pin1').value = ''; $('pin2').value = '';
  enterIssue();
});

// ── issue screen ────────────────────────────────────────────────────
const refreshLog = () => {
  const log = loadJSON(LOG_LS, []);
  const box = $('log');
  box.innerHTML = '';
  if (!log.length) { box.innerHTML = '<div class="empty">No keys issued on this phone yet.</div>'; return; }
  log.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'row';
    const dev = document.createElement('span'); dev.className = 'dev'; dev.textContent = e.deviceId;
    const dt = document.createElement('span'); dt.className = 'dt';
    try { dt.textContent = new Date(e.issuedAt).toLocaleDateString(); } catch { dt.textContent = ''; }
    const cp = document.createElement('button'); cp.className = 'mini'; cp.textContent = 'Copy';
    cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(e.key); cp.textContent = 'Copied'; setTimeout(() => { cp.textContent = 'Copy'; }, 1200); } catch { }
    });
    const del = document.createElement('button'); del.className = 'mini'; del.textContent = 'Del';
    del.addEventListener('click', () => {
      saveJSON(LOG_LS, loadJSON(LOG_LS, []).filter((x) => x.issuedAt !== e.issuedAt));
      refreshLog();
    });
    row.append(dev, dt, cp, del);
    box.appendChild(row);
  });
};

$('go').addEventListener('click', async () => {
  clearFail('err');
  $('go').disabled = true;
  try {
    const deviceId = normalizeDeviceId($('device').value);
    if (!deviceId) throw new Error('Enter a valid Device ID (BP-XXXX-XXXX-XXXX).');
    const root = getRoot();
    if (!root || !root.d) throw new Error('No root on this phone. Set it up first.');
    const priv = await window.crypto.subtle.importKey('jwk', root, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const sigBuf = await window.crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new TextEncoder().encode(deviceId));
    const sigBytes = new Uint8Array(sigBuf);
    if (sigBytes.length !== 64) throw new Error('Signing failed on this phone.');
    const key = `BP-${groupsOf(deviceId + b32encode(sigBytes), 5)}`;
    const entry = { deviceId: `BP-${groupsOf(deviceId, 4)}`, key, issuedAt: new Date().toISOString() };
    saveJSON(LOG_LS, [entry, ...loadJSON(LOG_LS, [])].slice(0, LOG_MAX));
    $('keytext').textContent = key;
    $('out').style.display = 'block';
    refreshLog();
  } catch (e) {
    fail('err', (e && e.message) || 'Could not issue a key on this phone.');
  }
  $('go').disabled = false;
});
$('device').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('go').click(); });
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('keytext').textContent);
    $('copy').textContent = 'Copied ✓';
    setTimeout(() => { $('copy').textContent = 'Copy Key'; }, 1200);
  } catch { }
});
$('changepin').addEventListener('click', () => {
  try { localStorage.removeItem(PIN_LS); } catch { }
  pinMode = 'setup';
  $('pinlabel').textContent = 'Set a new 4-digit PIN';
  $('pin2wrap').style.display = 'block';
  $('pingo').textContent = 'Set PIN & Enter';
  $('pin1').value = ''; $('pin2').value = '';
  show('screen-pin');
});
$('removeroot').addEventListener('click', () => {
  if (!window.confirm('Remove the private root and log from this phone?')) return;
  try { localStorage.removeItem(ROOT_LS); localStorage.removeItem(PIN_LS); localStorage.removeItem(LOG_LS); } catch { }
  boot();
});

const enterIssue = () => { refreshLog(); show('screen-issue'); };

const boot = () => {
  if (!getRoot()) { show('screen-setup'); return; }
  const pin = localStorage.getItem(PIN_LS) || '';
  if (!pin) {
    pinMode = 'setup';
    $('pinlabel').textContent = 'Set a 4-digit PIN';
    $('pin2wrap').style.display = 'block';
    $('pingo').textContent = 'Set PIN & Enter';
  } else {
    pinMode = 'unlock';
    $('pinlabel').textContent = 'Enter PIN';
    $('pin2wrap').style.display = 'none';
    $('pingo').textContent = 'Unlock';
  }
  $('pin1').value = ''; $('pin2').value = '';
  show('screen-pin');
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
boot();

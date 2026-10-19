// PhoneDukaan KeyGen — seller-PC licence issuer (Electron main process).
// Paste a customer Device ID, get back a device-bound BP- key. Offline only.
//
// The private root is NEVER baked into this app: it is read at runtime from
// bill-pro-license-private.jwk sitting beside the EXE (or BILL_PRO_PRIVATE_JWK).
// Keep this EXE + the .jwk on the seller PC only (+ USB backup).
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const LOG_MAX = 200;

const resolveKeyPath = () => {
  if (process.env.BILL_PRO_PRIVATE_JWK) return path.resolve(process.env.BILL_PRO_PRIVATE_JWK);
  // Portable EXEs run from an extracted temp dir — PORTABLE_EXECUTABLE_DIR points
  // back at the folder holding the portable EXE (where the sidecar .jwk lives).
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'bill-pro-license-private.jwk');
  }
  if (app.isPackaged) return path.join(path.dirname(process.execPath), 'bill-pro-license-private.jwk');
  return path.join(__dirname, '..', 'bill-pro-license-private.jwk');
};

const logFile = () => path.join(app.getPath('userData'), 'issued-log.json');

const readLog = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(logFile(), 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
};

const writeLog = (entries) => {
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true });
    fs.writeFileSync(logFile(), JSON.stringify(entries.slice(0, LOG_MAX), null, 1));
  } catch { }
};

const issueKey = async (rawDeviceId) => {
  const { normalizeDeviceId, b32encode, groupsOf } = await import('../license-codec.js');
  const deviceId = normalizeDeviceId(rawDeviceId);
  if (!deviceId) throw new Error('Enter a valid Device ID (BP-XXXX-XXXX-XXXX, 12 characters).');
  const keyPath = resolveKeyPath();
  if (!fs.existsSync(keyPath)) {
    throw new Error('Private key file not found. Copy bill-pro-license-private.jwk next to KeyGen.exe and try again.');
  }
  let jwk;
  try {
    jwk = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read private key file: ${error.message}`);
  }
  let privateKey;
  try {
    privateKey = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  } catch {
    throw new Error('Private key file is not a valid licence root.');
  }
  const signature = crypto.sign('sha256', Buffer.from(deviceId, 'utf8'), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  if (signature.length !== 64) throw new Error('Signing failed on this PC.');
  const key = `BP-${groupsOf(deviceId + b32encode(signature), 5)}`;
  const device = `BP-${groupsOf(deviceId, 4)}`;
  const entry = { deviceId: device, key, issuedAt: new Date().toISOString() };
  const next = [entry, ...readLog()].slice(0, LOG_MAX);
  writeLog(next);
  return { key, device };
};

// Headless smoke mode: KeyGen.exe --issue BP-XXXX-XXXX-XXXX  →  prints JSON, exits.
const smokeArg = process.argv.find((a) => a === '--issue');
if (smokeArg) {
  const idx = process.argv.indexOf('--issue');
  const target = process.argv[idx + 1] || '';
  const outFlag = process.argv.find((a) => a.startsWith('--out='));
  const outPath = outFlag
    ? outFlag.slice('--out='.length)
    : path.join(process.env.TEMP || process.env.TMP || '.', 'keygen-smoke.json');
  issueKey(target).then(
    (out) => { try { fs.writeFileSync(outPath, JSON.stringify(out)); } catch { } console.log(JSON.stringify(out)); process.exit(0); },
    (error) => { try { fs.writeFileSync(outPath, JSON.stringify({ error: error.message })); } catch { } console.error(JSON.stringify({ error: error.message })); process.exit(1); },
  );
} else {
  const createWindow = () => {
    const win = new BrowserWindow({
      width: 600,
      height: 700,
      minWidth: 480,
      minHeight: 600,
      backgroundColor: '#f4f6fb',
      autoHideMenuBar: true,
      title: 'PhoneDukaan KeyGen',
      icon: path.join(__dirname, '..', 'electron', 'icon.ico'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.loadFile(path.join(__dirname, 'index.html'));
  };

  ipcMain.handle('keygen:issue', async (_event, deviceId) => {
    try {
      return { ok: true, ...(await issueKey(deviceId)) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('keygen:log', async () => readLog());
  ipcMain.handle('keygen:log-folder', async () => {
    await shell.openPath(path.dirname(logFile()));
    return path.dirname(logFile());
  });
  ipcMain.handle('keygen:paths', async () => ({ logFolder: path.dirname(logFile()), keyPath: resolveKeyPath() }));

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

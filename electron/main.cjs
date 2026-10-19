// PhoneDukaan Bill Pro — Electron main process (desktop/PC build).
// Loads the bundled Vite output over a privileged local `app://` scheme so the
// app runs fully offline with a secure context. Network is used only for the
// optional, user-initiated Google Drive backup.
const { app, BrowserWindow, session, shell, protocol, net, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const APP_SCHEME = 'app';
const DIST_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { secure: true, standard: true, supportFetchAPI: true } },
]);

const billsDir = () => {
  const dir = path.join(app.getPath('downloads'), 'PhoneDukaan');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

// ── Google Drive backup (desktop lane) ──────────────────────────────────────
const DRIVE_AUTH_PORT = 9763;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file openid email';
const DRIVE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DRIVE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_FOLDER_NAME = 'PhoneDukaan Backup';
const DRIVE_CONFIG_PATH = path.join(__dirname, 'drive-desktop-config.json');
const DRIVE_AUTH_FILE = 'drive-auth.json';
let driveAccess = { token: '', expiresAt: 0 };

const readDriveConfig = () => {
  try {
    const cfg = JSON.parse(fs.readFileSync(DRIVE_CONFIG_PATH, 'utf8'));
    if (cfg?.clientId && cfg?.clientSecret) return cfg;
  } catch { }
  return null;
};
const driveAuthPath = () => path.join(app.getPath('userData'), DRIVE_AUTH_FILE);
const loadDriveAuth = () => {
  try { return JSON.parse(fs.readFileSync(driveAuthPath(), 'utf8')); } catch { return null; }
};
const saveDriveAuth = (store) => {
  fs.mkdirSync(path.dirname(driveAuthPath()), { recursive: true });
  fs.writeFileSync(driveAuthPath(), JSON.stringify(store), 'utf8');
};
const encryptSecret = (plain) => {
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.encryptString(plain).toString('base64');
};
const decryptSecret = (payload) => {
  if (!payload?.enc) return null;
  try { return safeStorage.decryptString(Buffer.from(payload.enc, 'base64')); } catch { return null; }
};
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pkcePair = () => {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
};
const driveFetchJson = async (url, init = {}) => {
  const res = await fetch(url, init);
  let data = null;
  try { data = await res.json(); } catch { }
  if (!res.ok) {
    const message = data?.error?.message || `Google request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
};
const getDriveAccessToken = async () => {
  if (driveAccess.token && driveAccess.expiresAt - 120000 > Date.now()) return driveAccess.token;
  const store = loadDriveAuth();
  const refresh = decryptSecret(store?.refresh);
  if (!refresh) {
    const err = new Error('Not connected. Sign in again from Settings.');
    err.status = 401;
    throw err;
  }
  const cfg = readDriveConfig();
  if (!cfg) {
    const err = new Error('Add the Desktop OAuth client ID and secret in electron/drive-desktop-config.json.');
    err.status = 401;
    throw err;
  }
  const data = await driveFetchJson(DRIVE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }).toString(),
  });
  driveAccess = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return driveAccess.token;
};
const driveAuthHeaders = async () => ({ Authorization: `Bearer ${await getDriveAccessToken()}` });
const driveEnsureFolder = async () => {
  const headers = await driveAuthHeaders();
  const query = "appProperties has {key='pdBackup' and value='1'} and trashed=false";
  const listed = await driveFetchJson(`${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1&spaces=drive`, { headers });
  if (listed.files?.length) return listed.files[0];
  return driveFetchJson(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { pdBackup: '1' },
    }),
  });
};
const driveFindFile = async ({ folderId, fileName }) => {
  const headers = await driveAuthHeaders();
  const query = `'${folderId}' in parents and name='${String(fileName || '').replace(/'/g, "\\'")}' and trashed=false`;
  const data = await driveFetchJson(`${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=1&spaces=drive`, { headers });
  return data.files?.[0] || null;
};
const driveListFiles = async ({ folderId }) => {
  const headers = await driveAuthHeaders();
  const query = `'${folderId}' in parents and trashed=false`;
  const files = [];
  let pageToken = '';
  do {
    const url = `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,modifiedTime,size)&pageSize=100&spaces=drive${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const data = await driveFetchJson(url, { headers });
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return files.sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
};
const driveUploadFile = async ({ folderId, fileName, text, existingFileId }) => {
  const headers = await driveAuthHeaders();
  const boundary = `pdbackup${crypto.randomBytes(8).toString('hex')}`;
  const metadata = existingFileId
    ? { name: fileName, appProperties: { pdBackup: '1' } }
    : { name: fileName, mimeType: 'application/json', appProperties: { pdBackup: '1' }, parents: [folderId] };
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    text,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const url = existingFileId
    ? `${DRIVE_UPLOAD_API}/files/${existingFileId}?uploadType=multipart&fields=id,name,modifiedTime`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,modifiedTime`;
  return driveFetchJson(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
};
const startDriveAuth = async () => {
  const cfg = readDriveConfig();
  if (!cfg) {
    return { ok: false, error: 'Add the Desktop OAuth client ID and secret in electron/drive-desktop-config.json, then connect again.' };
  }
  const { verifier, challenge } = pkcePair();
  const redirectUri = `http://127.0.0.1:${DRIVE_AUTH_PORT}/callback`;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  const server = http.createServer();
  const codePromise = new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${DRIVE_AUTH_PORT}`);
        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end();
          return;
        }
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><html><body style="font-family:sans-serif;background:#0d1b2a;color:#e9efff;text-align:center;padding:40px"><h2>Google account connected</h2><p>You can close this window and return to PhoneDukaan.</p></body></html>');
        setTimeout(() => { try { server.close(); } catch { } }, 100);
        if (error || !code) reject(new Error(error || 'Google sign-in did not return a code.'));
        else resolve(code);
      } catch (e) {
        reject(e);
      }
    });
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(DRIVE_AUTH_PORT, '127.0.0.1', resolve);
    });
  } catch {
    return { ok: false, error: `Port ${DRIVE_AUTH_PORT} is busy. Close other PhoneDukaan sign-in windows and try again.` };
  }
  try {
    await shell.openExternal(authUrl);
  } catch {
    try { server.close(); } catch { }
    return { ok: false, error: 'Could not open your browser for sign-in.' };
  }
  let code;
  try {
    code = await Promise.race([
      codePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Sign-in timed out. Try again.')), 300000)),
    ]);
  } catch (e) {
    try { server.close(); } catch { }
    return { ok: false, error: e?.message || 'Sign-in was cancelled.' };
  }
  let tokenData;
  try {
    tokenData = await driveFetchJson(DRIVE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }).toString(),
    });
  } catch (e) {
    return { ok: false, error: e?.message || 'Google did not accept the sign-in.' };
  }
  if (!tokenData?.refresh_token) {
    return { ok: false, error: 'Google did not grant offline access. Sign in again.' };
  }
  let email = '';
  try {
    const info = await driveFetchJson(DRIVE_USERINFO_URL, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    email = String(info?.email || '');
  } catch { }
  const refreshEnc = encryptSecret(tokenData.refresh_token);
  if (!refreshEnc) {
    return { ok: false, error: 'Windows could not encrypt the Google token safely. Sign-in was aborted.' };
  }
  saveDriveAuth({ email, refresh: { enc: refreshEnc } });
  driveAccess = { token: tokenData.access_token, expiresAt: Date.now() + Number(tokenData.expires_in || 3600) * 1000 };
  return { ok: true, email };
};
ipcMain.handle('pd-drive:auth-start', () => startDriveAuth().catch((e) => ({ ok: false, error: e?.message || 'Sign-in failed.' })));
ipcMain.handle('pd-drive:token', () => getDriveAccessToken()
  .then((accessToken) => ({
    accessToken,
    expiresIn: Math.max(60, Math.round((driveAccess.expiresAt - Date.now()) / 1000)),
    email: loadDriveAuth()?.email || '',
  }))
  .catch((e) => ({ error: e?.message || 'Not connected.' })));
ipcMain.handle('pd-drive:ensure-folder', () => driveEnsureFolder().catch((e) => { throw new Error(e?.message || 'Drive request failed.'); }));
ipcMain.handle('pd-drive:find-file', (_e, query) => driveFindFile(query || {}).catch((e) => { throw new Error(e?.message || 'Drive request failed.'); }));
ipcMain.handle('pd-drive:list', (_e, query) => driveListFiles(query || {}).catch((e) => { throw new Error(e?.message || 'Drive request failed.'); }));
ipcMain.handle('pd-drive:upload', (_e, query) => driveUploadFile(query || {}).catch((e) => { throw new Error(e?.message || 'Drive request failed.'); }));
ipcMain.handle('pd-drive:download', async (_e, { fileId }) => {
  const headers = await driveAuthHeaders();
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers });
  if (!res.ok) throw new Error(`Drive download failed (${res.status}).`);
  return res.text();
});
ipcMain.handle('pd-drive:revoke', async () => {
  const refresh = decryptSecret(loadDriveAuth()?.refresh);
  if (refresh) {
    try {
      await fetch(DRIVE_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${encodeURIComponent(refresh)}`,
      });
    } catch { }
  }
  try { fs.rmSync(driveAuthPath(), { force: true }); } catch { }
  driveAccess = { token: '', expiresAt: 0 };
  return { ok: true };
});
// ── end Google Drive backup ─────────────────────────────────────────────────

const sanitizeFileName = (name) =>
  String(name || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').slice(0, 120) || 'file';

const resolveAppFile = (requestUrl) => {
  const url = new URL(requestUrl);
  let pathname = decodeURIComponent(url.pathname || '/');
  if (pathname === '/') pathname = '/index.html';
  let filePath = path.normalize(path.join(DIST_DIR, pathname));
  if (!filePath.startsWith(DIST_DIR)) return path.join(DIST_DIR, 'index.html');
  try {
    if (fs.statSync(filePath).isDirectory()) return path.join(DIST_DIR, 'index.html');
  } catch {
    return path.join(DIST_DIR, 'index.html');
  }
  return filePath;
};

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0d1b2a',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadURL(`${APP_SCHEME}:///index.html`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  return win;
};

if (!app.requestSingleInstanceLock()) app.quit();

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  protocol.handle(APP_SCHEME, (request) => net.fetch(pathToFileURL(resolveAppFile(request.url)).toString()));

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  // Bills, invoice PDFs and CSV backups land in Downloads/PhoneDukaan silently.
  session.defaultSession.on('will-download', (_event, item) => {
    try {
      item.setSavePath(path.join(billsDir(), sanitizeFileName(item.getFilename())));
    } catch {
      // Fall back to Electron's default download behaviour.
    }
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

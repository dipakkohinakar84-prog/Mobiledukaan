export const DRIVE_FOLDER_NAME = 'PhoneDukaan Backup'
export const BACKUP_FILE_PREFIX = 'PhoneDukaan-Backup'
export const DRIVE_BACKUP_SCHEMA_VERSION = 1
export const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file openid email'
export const DRIVE_API = 'https://www.googleapis.com/drive/v3'
export const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
export const DRIVE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
export const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

export class DriveBackupError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'DriveBackupError'
    this.status = status
  }
}

const isRecordObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value)

const sanitizeFileToken = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'device'

export const backupFileNameFor = (deviceId) => `${BACKUP_FILE_PREFIX}-${sanitizeFileToken(deviceId)}.json`

const stampOf = (record) => {
  const raw = record?.updatedAt || record?.pdfSavedAt || record?.dateTime || record?.addedDate || ''
  const time = raw ? Date.parse(raw) : Number.NaN
  return Number.isNaN(time) ? 0 : time
}

const recordKey = (record) => String(record?.id || '')

export const pickNewerRecord = (a, b) => {
  const ta = stampOf(a)
  const tb = stampOf(b)
  if (tb !== ta) return tb > ta ? b : a
  return a
}

const recordList = (value) => (Array.isArray(value) ? value.filter(isRecordObject) : [])

export const mergeBackupPayloads = (localPayload, remotePayloads = []) => {
  const localState = localPayload?.appState || {}
  const merged = {
    inv: recordList(localState.inv).slice(),
    tx: recordList(localState.tx).slice(),
    repairs: recordList(localState.repairs).slice(),
  }
  const index = { inv: new Map(), tx: new Map(), repairs: new Map() }
  for (const key of ['inv', 'tx', 'repairs']) {
    merged[key].forEach((record, position) => {
      const id = recordKey(record)
      if (id) index[key].set(id, position)
    })
  }
  let shop = isRecordObject(localState.shop) ? localState.shop : null
  let shopStamp = localPayload?.savedAt ? Date.parse(localPayload.savedAt) : 0
  if (Number.isNaN(shopStamp)) shopStamp = 0
  for (const payload of remotePayloads) {
    if (!payload || payload.schemaVersion !== DRIVE_BACKUP_SCHEMA_VERSION) continue
    const remote = payload.appState || {}
    for (const key of ['inv', 'tx', 'repairs']) {
      for (const record of recordList(remote[key])) {
        const id = recordKey(record)
        if (!id) continue
        const at = index[key].get(id)
        if (at === undefined) {
          index[key].set(id, merged[key].length)
          merged[key].push(record)
        } else {
          merged[key][at] = pickNewerRecord(merged[key][at], record)
        }
      }
    }
    const remoteShop = isRecordObject(remote.shop) ? remote.shop : null
    if (remoteShop) {
      const stamp = payload?.savedAt ? Date.parse(payload.savedAt) : 0
      if (!Number.isNaN(stamp) && (!shop || stamp > shopStamp)) {
        shop = remoteShop
        shopStamp = stamp
      }
    }
  }
  return { inv: merged.inv, tx: merged.tx, repairs: merged.repairs, shop }
}

export const buildBackupPayload = ({ inv = [], tx = [], repairs = [], shop = null } = {}, deviceId, deviceSeries = '') => ({
  schemaVersion: DRIVE_BACKUP_SCHEMA_VERSION,
  app: 'PhoneDukaan Bill Pro',
  deviceId: String(deviceId || ''),
  deviceSeries: String(deviceSeries || ''),
  savedAt: new Date().toISOString(),
  appState: { inv, tx, repairs, shop },
})

export const readBackupPayload = (raw) => {
  let payload
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw)
    } catch {
      throw new DriveBackupError('That backup file is not valid JSON.')
    }
  } else {
    payload = raw
  }
  if (!payload || payload.schemaVersion !== DRIVE_BACKUP_SCHEMA_VERSION || !payload.appState || typeof payload.appState !== 'object') {
    throw new DriveBackupError('That file is not a PhoneDukaan backup.')
  }
  return payload
}

export const yymmFor = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value)
  const safe = Number.isNaN(date?.getTime?.()) ? new Date() : date
  return `${String(safe.getFullYear()).slice(-2)}${String(safe.getMonth() + 1).padStart(2, '0')}`
}

export const nextSeriesInvoiceNumber = (tx, prefix, series, yyMM) => {
  const stem = `${prefix}-${series}-${yyMM}-`
  let max = 0
  for (const t of Array.isArray(tx) ? tx : []) {
    const no = t?.invoiceNo
    if (typeof no !== 'string' || !no.startsWith(stem)) continue
    const num = Number.parseInt(no.slice(stem.length), 10)
    if (Number.isFinite(num) && num > max) max = num
  }
  return `${stem}${String(max + 1).padStart(4, '0')}`
}

const authFetch = async (token, url, init = {}) => {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    let message = `Google Drive request failed (${res.status})`
    try {
      const data = await res.json()
      if (data?.error?.message) message = data.error.message
    } catch { /* keep generic message */ }
    throw new DriveBackupError(message, res.status)
  }
  return res
}

export const ensureBackupFolder = async (token) => {
  const query = "appProperties has {key='pdBackup' and value='1'} and trashed=false"
  const listed = await authFetch(token, `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1&spaces=drive`)
  const found = await listed.json()
  if (found.files?.length) return found.files[0]
  const created = await authFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { pdBackup: '1' },
    }),
  })
  return created.json()
}

export const findBackupFile = async (token, folderId, fileName) => {
  const query = `'${folderId}' in parents and name='${fileName.replace(/'/g, "\\'")}' and trashed=false`
  const res = await authFetch(token, `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=1&spaces=drive`)
  const data = await res.json()
  return data.files?.[0] || null
}

export const listBackupFiles = async (token, folderId) => {
  const query = `'${folderId}' in parents and trashed=false`
  const files = []
  let pageToken = ''
  do {
    const url = `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,modifiedTime,size)&pageSize=100&spaces=drive${pageToken ? `&pageToken=${pageToken}` : ''}`
    const data = await (await authFetch(token, url)).json()
    files.push(...(data.files || []))
    pageToken = data.nextPageToken || ''
  } while (pageToken)
  return files.sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')))
}

export const uploadBackup = async (token, folderId, fileName, payloadText, existingFileId = '') => {
  const boundary = `pdbackup${Math.random().toString(36).slice(2)}`
  const metadata = existingFileId
    ? { name: fileName, appProperties: { pdBackup: '1' } }
    : { name: fileName, mimeType: 'application/json', appProperties: { pdBackup: '1' }, parents: [folderId] }
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    payloadText,
    `--${boundary}--`,
    '',
  ].join('\r\n')
  const url = existingFileId
    ? `${DRIVE_UPLOAD_API}/files/${existingFileId}?uploadType=multipart&fields=id,name,modifiedTime`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,modifiedTime`
  const res = await authFetch(token, url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return res.json()
}

export const downloadBackupFile = async (token, fileId) => {
  const res = await authFetch(token, `${DRIVE_API}/files/${fileId}?alt=media`)
  return res.text()
}

export const revokeDriveToken = async (token) => {
  try {
    await fetch(DRIVE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(token)}`,
    })
  } catch { /* best effort revoke */ }
}

export const fetchDriveEmail = async (token) => {
  try {
    const res = await authFetch(token, USERINFO_URL)
    const data = await res.json()
    return String(data?.email || '')
  } catch {
    return ''
  }
}

export const loadGsiScript = () => new Promise((resolve, reject) => {
  if (typeof window === 'undefined') {
    reject(new DriveBackupError('Google sign-in is unavailable here.'))
    return
  }
  if (window.google?.accounts?.oauth2) {
    resolve(window.google)
    return
  }
  const existing = document.querySelector(`script[src="${GSI_SCRIPT_SRC}"]`)
  const script = existing || Object.assign(document.createElement('script'), { src: GSI_SCRIPT_SRC, async: true })
  script.addEventListener('load', () => {
    if (window.google?.accounts?.oauth2) resolve(window.google)
    else reject(new DriveBackupError('Google sign-in failed to load.'))
  })
  script.addEventListener('error', () => reject(new DriveBackupError('Could not reach Google sign-in.')))
  if (!existing) document.head.appendChild(script)
})

export const requestDriveToken = (clientId, { prompt = '' } = {}) => loadGsiScript().then(() => new Promise((resolve, reject) => {
  try {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response?.error) {
          reject(new DriveBackupError(response.error === 'popup_closed_by_user' ? 'Google sign-in was cancelled.' : `Google sign-in failed (${response.error}).`))
        } else if (response?.access_token) {
          resolve({ accessToken: response.access_token, expiresIn: Number(response.expires_in || 3600), scope: String(response.scope || '') })
        } else {
          reject(new DriveBackupError('Google sign-in returned no token.'))
        }
      },
    })
    client.requestAccessToken({ prompt })
  } catch (e) {
    reject(new DriveBackupError(e?.message || 'Google sign-in failed.'))
  }
}))

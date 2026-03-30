import crypto from 'node:crypto'

import { createShopStorageToken, normalizeShopId, openSecret, readShopStorageToken, sealSecret } from './common.mjs'

const REGISTRY_SHEET = 'registry'
const REGISTRY_COLUMNS = ['shopId', 'shopName', 'loginId', 'passwordHash', 'syncKey', 'serviceAccountEmail', 'privateKey', 'spreadsheetId', 'driveFolderId', 'driveOauthRefreshToken', 'driveOauthEmail', 'driveOauthConnectedAt', 'updatedAt']
const DRIVE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email'
const INVENTORY_COLUMNS = ['id', 'imei', 'imei2', 'brand', 'model', 'color', 'ram', 'storage', 'batteryHealth', 'condition', 'buyPrice', 'sellPrice', 'status', 'qty', 'addedDate', 'supplier', 'photosJson', 'customerName', 'customerPhone', 'soldDate', 'lastInvoiceNo', 'updatedAt']
const TRANSACTION_COLUMNS = ['id', 'type', 'stockItemId', 'imei', 'imei2', 'brand', 'model', 'color', 'ram', 'storage', 'batteryHealth', 'condition', 'customerName', 'phone', 'amount', 'paidAmount', 'dueAmount', 'costPrice', 'paymentMode', 'invoiceNo', 'billType', 'gstRate', 'taxableAmount', 'gstAmount', 'cgstAmount', 'sgstAmount', 'totalAmount', 'date', 'dateTime', 'notes', 'whatsAppMessageAt', 'whatsAppPdfAt', 'shopSnapshotJson', 'updatedAt']
const KEY_VALUE_COLUMNS = ['key', 'value']
const GOOGLE_API_SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']

const tokenCache = new Map()
const spreadsheetMetadataCache = new Map()
const readCache = new Map()

export function getSyncRuntimeConfig() {
  return {
    ok: true,
    storageMode: 'google-api',
    hasDefaultUrl: false,
    defaultUrl: '',
    hasDefaultSyncKey: false,
    requiresScriptUrl: false,
    syncTargetLabel: 'Google Sheets + Drive',
  }
}

export async function authShop({ loginId, passwordHash }) {
  const registry = await readShopRegistry()
  const normalizedLoginId = String(loginId || '').trim().toLowerCase()
  const normalizedPasswordHash = String(passwordHash || '').trim()
  const shop = registry.find(entry => String(entry.loginId || '').trim().toLowerCase() === normalizedLoginId && String(entry.passwordHash || '').trim() === normalizedPasswordHash)
  if (!shop) throw new Error('Invalid shop ID or password.')
  if (!hasShopStorage(shop)) throw new Error('This shop is missing Google Sheets/Drive credentials in admin setup.')

  return {
    ok: true,
    storageToken: createShopStorageToken({ shopId: shop.shopId, ...normalizeShopStorage(shop) }),
    shop: {
      shopId: shop.shopId,
      shopName: shop.shopName || shop.shopId,
      syncKey: shop.syncKey || '',
      storageType: 'google-api',
      driveOauthConnected: Boolean(shop.driveOauthRefreshToken),
      driveOauthEmail: shop.driveOauthEmail || '',
    },
  }
}

export async function listShops() {
  return withReadCache('registry:list', 15000, async () => {
    const registry = await readShopRegistry()
    return {
      ok: true,
      shops: registry.map(shop => ({
        shopId: shop.shopId,
        shopName: shop.shopName || shop.shopId,
        loginId: shop.loginId,
        syncKey: shop.syncKey ? 'Configured' : '',
        storageType: hasShopStorage(shop) ? 'google-api' : 'missing',
        spreadsheetId: shop.spreadsheetId ? 'Configured' : '',
        driveFolderId: shop.driveFolderId ? 'Configured' : '',
        driveOauthConnected: Boolean(shop.driveOauthRefreshToken),
        driveOauthEmail: shop.driveOauthEmail || '',
        updatedAt: shop.updatedAt || '',
      })),
    }
  })
}

export async function upsertShop({ shopId, shopName, loginId, passwordHash, syncKey, serviceAccountEmail, privateKey, spreadsheetId, driveFolderId }) {
  const existingRegistry = await readShopRegistry()
  const existing = existingRegistry.find(entry => String(entry.shopId) === normalizeShopId(shopId))
  const normalized = normalizeRegistryEntry({
    shopId,
    shopName,
    loginId,
    passwordHash,
    syncKey,
    serviceAccountEmail,
    privateKey,
    spreadsheetId,
    driveFolderId,
    driveOauthRefreshToken: existing?.driveOauthRefreshToken || '',
    driveOauthEmail: existing?.driveOauthEmail || '',
    driveOauthConnectedAt: existing?.driveOauthConnectedAt || '',
    updatedAt: new Date().toISOString(),
  })

  if (!normalized.shopId || !normalized.loginId || !normalized.passwordHash) {
    throw new Error('Shop ID, login ID, and password are required.')
  }
  if (!hasShopStorage(normalized)) {
    throw new Error('Service account email, private key, spreadsheet ID, and drive folder ID are required.')
  }

  const next = existingRegistry.filter(entry => String(entry.shopId) !== normalized.shopId)
  next.unshift(normalized)
  await writeShopRegistry(next)
  invalidateReadCache(['registry'])

  return {
    ok: true,
    shop: {
      shopId: normalized.shopId,
      shopName: normalized.shopName,
      loginId: normalized.loginId,
    },
  }
}

export async function syncAction(input) {
  const storageToken = String(input?.storageToken || '').trim()
  if (!storageToken) throw new Error('Shop storage token is required.')
  const tokenData = readShopStorageToken(storageToken)
  const storageConfig = { shopId: normalizeShopId(tokenData?.shopId || input?.shopId), ...normalizeShopStorage(tokenData) }
  if (!hasShopStorage(storageConfig)) throw new Error('Shop storage configuration is incomplete.')
  return forwardToGoogleStorage(input || {}, storageConfig)
}

export async function getPhotoPreviewStream({ storageToken, fileId, shopId }) {
  const normalizedToken = String(storageToken || '').trim()
  const normalizedFileId = String(fileId || '').trim()
  if (!normalizedToken || !normalizedFileId) throw new Error('Photo preview requires storage token and file ID.')
  const tokenData = readShopStorageToken(normalizedToken)
  const normalizedShopId = normalizeShopId(tokenData?.shopId || shopId)
  const { accessToken } = await getDriveAccessTokenForShop(normalizedShopId)
  const metadata = await googleDriveJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(normalizedFileId)}?supportsAllDrives=true&fields=id,name,mimeType`, { accessToken })
  const { buffer, contentType } = await googleDriveBytes(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(normalizedFileId)}?supportsAllDrives=true&alt=media`, accessToken)
  return {
    buffer,
    contentType: metadata.mimeType || contentType || 'application/octet-stream',
    fileName: metadata.name || 'photo',
  }
}

export async function getDriveOAuthStatus({ shopId }) {
  const shop = await getShopById(shopId)
  return {
    ok: true,
    connected: Boolean(shop?.driveOauthRefreshToken),
    email: shop?.driveOauthEmail || '',
    connectedAt: shop?.driveOauthConnectedAt || '',
  }
}

export async function storeDriveOAuthTokens({ shopId, refreshToken, email }) {
  const registry = await readShopRegistry()
  const targetId = normalizeShopId(shopId)
  const existing = registry.find(entry => String(entry.shopId) === targetId)
  if (!existing) throw new Error('Shop not found for Drive OAuth connection.')
  existing.driveOauthRefreshToken = refreshToken ? sealSecret(refreshToken) : ''
  existing.driveOauthEmail = String(email || '').trim()
  existing.driveOauthConnectedAt = refreshToken ? new Date().toISOString() : ''
  existing.updatedAt = new Date().toISOString()
  await writeShopRegistry(registry)
  invalidateReadCache(['registry'])
  return {
    ok: true,
    connected: Boolean(existing.driveOauthRefreshToken),
    email: existing.driveOauthEmail,
    connectedAt: existing.driveOauthConnectedAt,
  }
}

export async function disconnectDriveOAuth({ shopId }) {
  return storeDriveOAuthTokens({ shopId, refreshToken: '', email: '' })
}

function withReadCache(key, ttlMs, loader) {
  const cached = readCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value)
  return Promise.resolve(loader()).then(value => {
    readCache.set(key, { value, expiresAt: Date.now() + ttlMs })
    return value
  })
}

function invalidateReadCache(prefixes = []) {
  for (const key of readCache.keys()) {
    if (prefixes.some(prefix => key === prefix || key.startsWith(`${prefix}:`))) {
      readCache.delete(key)
    }
  }
}

function normalizeShopStorage(storage = {}) {
  return {
    serviceAccountEmail: String(storage.serviceAccountEmail || '').trim(),
    privateKey: String(storage.privateKey || '').replace(/\\n/g, '\n').trim(),
    spreadsheetId: String(storage.spreadsheetId || '').trim(),
    driveFolderId: String(storage.driveFolderId || '').trim(),
  }
}

function hasShopStorage(storage = {}) {
  return Boolean(storage.serviceAccountEmail && storage.privateKey && storage.spreadsheetId && storage.driveFolderId)
}

async function getShopById(shopId) {
  const registry = await readShopRegistry()
  return registry.find(entry => String(entry.shopId) === normalizeShopId(shopId)) || null
}

function getGoogleOAuthConfig() {
  return {
    clientId: String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim(),
    redirectUri: String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim(),
  }
}

export function getDriveOAuthStartUrl({ state }) {
  const { clientId, redirectUri } = getGoogleOAuthConfig()
  if (!clientId || !redirectUri) throw new Error('GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_REDIRECT_URI are required for Drive OAuth.')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: DRIVE_OAUTH_SCOPE,
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeDriveOAuthCode({ code }) {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig()
  if (!clientId || !clientSecret || !redirectUri) throw new Error('Google OAuth client credentials are incomplete.')
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(code || '').trim(),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.access_token) throw new Error(data?.error_description || data?.error || `Google OAuth exchange failed (${response.status}).`)
  return data
}

async function refreshDriveAccessToken(refreshToken) {
  const { clientId, clientSecret } = getGoogleOAuthConfig()
  if (!clientId || !clientSecret) throw new Error('Google OAuth client credentials are incomplete.')
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.access_token) throw new Error(data?.error_description || data?.error || `Google Drive token refresh failed (${response.status}).`)
  return data
}

export async function getGoogleProfileEmail(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error?.message || data?.error || `Google profile lookup failed (${response.status}).`)
  return String(data?.email || '').trim()
}

function getRegistryStorage() {
  const serviceAccount = getServiceAccountConfig()
  return normalizeShopStorage({
    serviceAccountEmail: serviceAccount.clientEmail,
    privateKey: serviceAccount.privateKey,
    spreadsheetId: String(process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '').trim(),
    driveFolderId: String(process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim(),
  })
}

function getServiceAccountConfig(storageConfig = null) {
  if (storageConfig?.serviceAccountEmail && storageConfig?.privateKey) {
    return {
      clientEmail: String(storageConfig.serviceAccountEmail || '').trim(),
      privateKey: String(storageConfig.privateKey || '').replace(/\\n/g, '\n').trim(),
      tokenUri: 'https://oauth2.googleapis.com/token',
    }
  }

  const rawJson = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim()
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson.startsWith('{') ? rawJson : Buffer.from(rawJson, 'base64').toString('utf8'))
      return {
        clientEmail: String(parsed.client_email || '').trim(),
        privateKey: String(parsed.private_key || '').replace(/\\n/g, '\n').trim(),
        tokenUri: String(parsed.token_uri || 'https://oauth2.googleapis.com/token').trim(),
      }
    } catch {
      // fall through to explicit env vars
    }
  }

  return {
    clientEmail: String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim(),
    privateKey: String(process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim(),
    tokenUri: 'https://oauth2.googleapis.com/token',
  }
}

async function getGoogleAccessToken(storageConfig = null) {
  const serviceAccount = getServiceAccountConfig(storageConfig)
  if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error('Google service account credentials are missing.')
  }

  const cacheKey = serviceAccount.clientEmail
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value

  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const claim = Buffer.from(JSON.stringify({
    iss: serviceAccount.clientEmail,
    scope: GOOGLE_API_SCOPES.join(' '),
    aud: serviceAccount.tokenUri,
    exp: now + 3600,
    iat: now,
  })).toString('base64url')
  const unsigned = `${header}.${claim}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const signature = signer.sign(serviceAccount.privateKey).toString('base64url')

  const response = await fetch(serviceAccount.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || `Google auth failed (${response.status}).`)
  }

  tokenCache.set(cacheKey, {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(0, Number(data.expires_in || 3600) - 120) * 1000,
  })
  return data.access_token
}

async function googleJson(url, { method = 'GET', headers = {}, body, storageConfig = null } = {}) {
  const accessToken = await getGoogleAccessToken(storageConfig)
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...headers },
    body,
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error_description || text || `Google API failed (${response.status}).`)
  }
  return data
}

async function googleBytes(url, storageConfig = null) {
  const accessToken = await getGoogleAccessToken(storageConfig)
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Google API failed (${response.status}).`)
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  }
}

function columnLetter(index) {
  let current = Number(index || 1)
  let result = ''
  while (current > 0) {
    const remainder = (current - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    current = Math.floor((current - 1) / 26)
  }
  return result || 'A'
}

function encodeRange(value) {
  return encodeURIComponent(value)
}

async function getSpreadsheetMetadata(storageConfig) {
  const spreadsheetId = String(storageConfig.spreadsheetId || '').trim()
  const cached = spreadsheetMetadataCache.get(spreadsheetId)
  if (cached) return cached
  const data = await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(title))`, { storageConfig })
  spreadsheetMetadataCache.set(spreadsheetId, data)
  return data
}

async function ensureSheet(sheetName, headers, storageConfig) {
  const spreadsheetId = String(storageConfig.spreadsheetId || '').trim()
  const metadata = await getSpreadsheetMetadata(storageConfig)
  const exists = Array.isArray(metadata.sheets) && metadata.sheets.some(sheet => sheet.properties?.title === sheetName)
  if (!exists) {
    await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
      storageConfig,
    })
    spreadsheetMetadataCache.delete(spreadsheetId)
  }

  const firstRow = await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeRange(`${sheetName}!A1:${columnLetter(headers.length)}1`)}`, { storageConfig })
  const currentHeaders = Array.isArray(firstRow.values?.[0]) ? firstRow.values[0] : []
  if (!headers.every((header, index) => currentHeaders[index] === header)) {
    await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeRange(`${sheetName}!A1`)}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [headers] }),
      storageConfig,
    })
  }
}

async function readObjectsFromSheet(sheetName, headers, requiredField, storageConfig) {
  await ensureSheet(sheetName, headers, storageConfig)
  const spreadsheetId = String(storageConfig.spreadsheetId || '').trim()
  const data = await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeRange(`${sheetName}!A:${columnLetter(headers.length)}`)}`, { storageConfig })
  const rows = Array.isArray(data.values) ? data.values.slice(1) : []
  return rows.map(row => {
    const item = {}
    headers.forEach((header, index) => {
      item[header] = row[index] ?? ''
    })
    return item
  }).filter(item => !requiredField || String(item[requiredField] || '').trim() !== '')
}

async function writeObjectsToSheet(sheetName, headers, rows, storageConfig) {
  await ensureSheet(sheetName, headers, storageConfig)
  const spreadsheetId = String(storageConfig.spreadsheetId || '').trim()
  await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeRange(sheetName)}:clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    storageConfig,
  })
  const values = [headers, ...rows.map(item => headers.map(header => item?.[header] == null ? '' : String(item[header])))]
  await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeRange(`${sheetName}!A1`)}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
    storageConfig,
  })
}

function encodeValue(value) {
  return JSON.stringify(value == null ? '' : value)
}

function decodeValue(value) {
  if (value === '' || value == null) return ''
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

async function readKeyValueSheet(sheetName, storageConfig) {
  const rows = await readObjectsFromSheet(sheetName, KEY_VALUE_COLUMNS, 'key', storageConfig)
  const result = {}
  rows.forEach(row => {
    result[String(row.key)] = decodeValue(row.value)
  })
  return result
}

async function writeKeyValueSheet(sheetName, data, storageConfig) {
  const rows = Object.keys(data || {}).map(key => ({ key, value: encodeValue(data[key]) }))
  await writeObjectsToSheet(sheetName, KEY_VALUE_COLUMNS, rows, storageConfig)
}

function normalizeRegistryEntry(shop = {}) {
  return {
    shopId: normalizeShopId(shop.shopId),
    shopName: String(shop.shopName || shop.shopId || '').trim(),
    loginId: String(shop.loginId || '').trim(),
    passwordHash: String(shop.passwordHash || '').trim(),
    syncKey: String(shop.syncKey || '').trim(),
    serviceAccountEmail: String(shop.serviceAccountEmail || '').trim(),
    privateKey: String(shop.privateKey || '').replace(/\\n/g, '\n').trim(),
    spreadsheetId: String(shop.spreadsheetId || '').trim(),
    driveFolderId: String(shop.driveFolderId || '').trim(),
    driveOauthRefreshToken: String(shop.driveOauthRefreshToken || '').trim(),
    driveOauthEmail: String(shop.driveOauthEmail || '').trim(),
    driveOauthConnectedAt: String(shop.driveOauthConnectedAt || '').trim(),
    updatedAt: String(shop.updatedAt || '').trim(),
  }
}

async function readShopRegistry() {
  const storage = getRegistryStorage()
  if (!hasShopStorage(storage)) throw new Error('Central admin registry Google credentials are missing in .env.')
  const rows = await readObjectsFromSheet(REGISTRY_SHEET, REGISTRY_COLUMNS, 'shopId', storage)
  return rows.map(normalizeRegistryEntry)
}

async function writeShopRegistry(registry) {
  const storage = getRegistryStorage()
  if (!hasShopStorage(storage)) throw new Error('Central admin registry Google credentials are missing in .env.')
  await writeObjectsToSheet(REGISTRY_SHEET, REGISTRY_COLUMNS, (registry || []).map(normalizeRegistryEntry), storage)
}

function sheetNameFor(shopId, suffix) {
  return `${normalizeShopId(shopId)}__${suffix}`.slice(0, 99)
}

function inventorySheetName(shopId) { return sheetNameFor(shopId, 'inventory') }
function transactionSheetName(shopId) { return sheetNameFor(shopId, 'transactions') }
function profileSheetName(shopId) { return sheetNameFor(shopId, 'profile') }
function metaSheetName(shopId) { return sheetNameFor(shopId, 'meta') }

function buildDrivePreviewUrl(fileId) {
  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(String(fileId || ''))}`
}

function normalizeCloudPhotoRef(photo = {}) {
  const fileId = String(photo.fileId || '').trim()
  return {
    id: String(photo.id || '').trim(),
    fileId,
    fileName: String(photo.fileName || 'photo.jpg').trim(),
    mimeType: String(photo.mimeType || 'image/jpeg').trim(),
    size: Number(photo.size || 0),
    uploadedAt: String(photo.uploadedAt || '').trim(),
    fileUrl: String(photo.fileUrl || (fileId ? buildDrivePreviewUrl(fileId) : '')).trim(),
  }
}

function normalizeInventoryRow(item = {}) {
  const photos = Array.isArray(item.photos) ? item.photos.map(normalizeCloudPhotoRef) : []
  return {
    id: String(item.id || '').trim(),
    imei: String(item.imei || '').trim(),
    imei2: String(item.imei2 || '').trim(),
    brand: String(item.brand || '').trim(),
    model: String(item.model || '').trim(),
    color: String(item.color || '').trim(),
    ram: String(item.ram || '').trim(),
    storage: String(item.storage || '').trim(),
    batteryHealth: String(item.batteryHealth || '').trim(),
    condition: String(item.condition || '').trim(),
    buyPrice: Number(item.buyPrice || 0),
    sellPrice: Number(item.sellPrice || 0),
    status: String(item.status || '').trim(),
    qty: Number(item.qty || 0),
    addedDate: String(item.addedDate || '').trim(),
    supplier: String(item.supplier || '').trim(),
    photosJson: JSON.stringify(photos),
    customerName: String(item.customerName || '').trim(),
    customerPhone: String(item.customerPhone || '').trim(),
    soldDate: String(item.soldDate || '').trim(),
    lastInvoiceNo: String(item.lastInvoiceNo || '').trim(),
    updatedAt: new Date().toISOString(),
  }
}

function inventoryRowToObject(row = {}) {
  let photos = []
  try {
    const parsed = row.photosJson ? JSON.parse(row.photosJson) : []
    photos = Array.isArray(parsed) ? parsed.map(photo => ({ ...normalizeCloudPhotoRef(photo), previewDataUrl: normalizeCloudPhotoRef(photo).fileUrl || '' })) : []
  } catch {
    photos = []
  }
  return {
    id: String(row.id || '').trim(),
    imei: String(row.imei || '').trim(),
    imei2: String(row.imei2 || '').trim(),
    brand: String(row.brand || '').trim(),
    model: String(row.model || '').trim(),
    color: String(row.color || '').trim(),
    ram: String(row.ram || '').trim(),
    storage: String(row.storage || '').trim(),
    batteryHealth: String(row.batteryHealth || '').trim(),
    condition: String(row.condition || '').trim(),
    buyPrice: Number(row.buyPrice || 0),
    sellPrice: Number(row.sellPrice || 0),
    status: String(row.status || '').trim(),
    qty: Number(row.qty || 0),
    addedDate: String(row.addedDate || '').trim(),
    supplier: String(row.supplier || '').trim(),
    photos,
    customerName: String(row.customerName || '').trim(),
    customerPhone: String(row.customerPhone || '').trim(),
    soldDate: String(row.soldDate || '').trim(),
    lastInvoiceNo: String(row.lastInvoiceNo || '').trim(),
  }
}

function normalizeTransactionRow(item = {}) {
  return {
    id: String(item.id || '').trim(),
    type: String(item.type || '').trim(),
    stockItemId: String(item.stockItemId || '').trim(),
    imei: String(item.imei || '').trim(),
    imei2: String(item.imei2 || '').trim(),
    brand: String(item.brand || '').trim(),
    model: String(item.model || '').trim(),
    color: String(item.color || '').trim(),
    ram: String(item.ram || '').trim(),
    storage: String(item.storage || '').trim(),
    batteryHealth: String(item.batteryHealth || '').trim(),
    condition: String(item.condition || '').trim(),
    customerName: String(item.customerName || '').trim(),
    phone: String(item.phone || '').trim(),
    amount: Number(item.amount || 0),
    paidAmount: Number(item.paidAmount || 0),
    dueAmount: Number(item.dueAmount || 0),
    costPrice: Number(item.costPrice || 0),
    paymentMode: String(item.paymentMode || '').trim(),
    invoiceNo: String(item.invoiceNo || '').trim(),
    billType: String(item.billType || '').trim(),
    gstRate: Number(item.gstRate || 0),
    taxableAmount: Number(item.taxableAmount || 0),
    gstAmount: Number(item.gstAmount || 0),
    cgstAmount: Number(item.cgstAmount || 0),
    sgstAmount: Number(item.sgstAmount || 0),
    totalAmount: Number(item.totalAmount || 0),
    date: String(item.date || '').trim(),
    dateTime: String(item.dateTime || '').trim(),
    notes: String(item.notes || '').trim(),
    whatsAppMessageAt: String(item.whatsAppMessageAt || '').trim(),
    whatsAppPdfAt: String(item.whatsAppPdfAt || '').trim(),
    shopSnapshotJson: JSON.stringify(item.shopSnapshot || null),
    updatedAt: new Date().toISOString(),
  }
}

function transactionRowToObject(row = {}) {
  let shopSnapshot = null
  try {
    shopSnapshot = row.shopSnapshotJson ? JSON.parse(row.shopSnapshotJson) : null
  } catch {
    shopSnapshot = null
  }
  return {
    id: String(row.id || '').trim(),
    type: String(row.type || '').trim(),
    stockItemId: String(row.stockItemId || '').trim(),
    imei: String(row.imei || '').trim(),
    imei2: String(row.imei2 || '').trim(),
    brand: String(row.brand || '').trim(),
    model: String(row.model || '').trim(),
    color: String(row.color || '').trim(),
    ram: String(row.ram || '').trim(),
    storage: String(row.storage || '').trim(),
    batteryHealth: String(row.batteryHealth || '').trim(),
    condition: String(row.condition || '').trim(),
    customerName: String(row.customerName || '').trim(),
    phone: String(row.phone || '').trim(),
    amount: Number(row.amount || 0),
    paidAmount: Number(row.paidAmount || 0),
    dueAmount: Number(row.dueAmount || 0),
    costPrice: Number(row.costPrice || 0),
    paymentMode: String(row.paymentMode || '').trim(),
    invoiceNo: String(row.invoiceNo || '').trim(),
    billType: String(row.billType || '').trim(),
    gstRate: Number(row.gstRate || 0),
    taxableAmount: Number(row.taxableAmount || 0),
    gstAmount: Number(row.gstAmount || 0),
    cgstAmount: Number(row.cgstAmount || 0),
    sgstAmount: Number(row.sgstAmount || 0),
    totalAmount: Number(row.totalAmount || 0),
    date: String(row.date || '').trim(),
    dateTime: String(row.dateTime || '').trim(),
    notes: String(row.notes || '').trim(),
    whatsAppMessageAt: String(row.whatsAppMessageAt || '').trim(),
    whatsAppPdfAt: String(row.whatsAppPdfAt || '').trim(),
    shopSnapshot,
  }
}

async function ensureShopSheetsInitialized(shopId, storageConfig) {
  await Promise.all([
    ensureSheet(inventorySheetName(shopId), INVENTORY_COLUMNS, storageConfig),
    ensureSheet(transactionSheetName(shopId), TRANSACTION_COLUMNS, storageConfig),
    ensureSheet(profileSheetName(shopId), KEY_VALUE_COLUMNS, storageConfig),
    ensureSheet(metaSheetName(shopId), KEY_VALUE_COLUMNS, storageConfig),
  ])
}

async function readShopPayload(shopId, storageConfig) {
  const normalizedShopId = normalizeShopId(shopId)
  await ensureShopSheetsInitialized(normalizedShopId, storageConfig)
  const [inventoryRows, transactionRows, profile, meta] = await Promise.all([
    readObjectsFromSheet(inventorySheetName(normalizedShopId), INVENTORY_COLUMNS, 'id', storageConfig),
    readObjectsFromSheet(transactionSheetName(normalizedShopId), TRANSACTION_COLUMNS, 'id', storageConfig),
    readKeyValueSheet(profileSheetName(normalizedShopId), storageConfig),
    readKeyValueSheet(metaSheetName(normalizedShopId), storageConfig),
  ])
  return {
    version: Number(meta.version || 3),
    savedAt: String(meta.savedAt || ''),
    inv: inventoryRows.map(inventoryRowToObject),
    tx: transactionRows.map(transactionRowToObject),
    shop: profile,
  }
}

async function readShopStatus(shopId, storageConfig) {
  const normalizedShopId = normalizeShopId(shopId)
  await ensureSheet(metaSheetName(normalizedShopId), KEY_VALUE_COLUMNS, storageConfig)
  const meta = await readKeyValueSheet(metaSheetName(normalizedShopId), storageConfig)
  return {
    shopId: normalizedShopId,
    hasData: Boolean(meta.hasData) || Number(meta.inventoryCount || 0) > 0 || Number(meta.transactionCount || 0) > 0 || Boolean(meta.hasShop),
    hasShop: Boolean(meta.hasShop),
    savedAt: String(meta.savedAt || ''),
  }
}

async function writeShopPayload(shopId, payload, storageConfig) {
  const normalizedShopId = normalizeShopId(shopId)
  await ensureShopSheetsInitialized(normalizedShopId, storageConfig)
  const savedAt = String(payload?.savedAt || new Date().toISOString())
  const inventory = Array.isArray(payload?.inv) ? payload.inv : []
  const transactions = Array.isArray(payload?.tx) ? payload.tx : []
  const shopProfile = payload?.shop && typeof payload.shop === 'object' ? payload.shop : {}
  await Promise.all([
    writeObjectsToSheet(inventorySheetName(normalizedShopId), INVENTORY_COLUMNS, inventory.map(normalizeInventoryRow), storageConfig),
    writeObjectsToSheet(transactionSheetName(normalizedShopId), TRANSACTION_COLUMNS, transactions.map(normalizeTransactionRow), storageConfig),
    writeKeyValueSheet(profileSheetName(normalizedShopId), shopProfile, storageConfig),
    writeKeyValueSheet(metaSheetName(normalizedShopId), {
      version: Number(payload?.version || 3),
      savedAt,
      shopId: normalizedShopId,
      inventoryCount: inventory.length,
      transactionCount: transactions.length,
      hasShop: Object.keys(shopProfile).length > 0,
      hasData: inventory.length > 0 || transactions.length > 0 || Object.keys(shopProfile).length > 0,
    }, storageConfig),
  ])
}

async function getDriveAccessTokenForShop(shopId) {
  const shop = await getShopById(shopId)
  if (!shop?.driveOauthRefreshToken) {
    throw new Error('Google Drive is not connected for this shop. Connect Google Drive first.')
  }
  const refreshToken = openSecret(shop.driveOauthRefreshToken)
  if (!refreshToken) throw new Error('Stored Google Drive token is invalid. Reconnect Google Drive.')
  const data = await refreshDriveAccessToken(refreshToken)
  return { accessToken: data.access_token, shop }
}

async function googleDriveJson(url, { method = 'GET', headers = {}, body, accessToken }) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${accessToken}`, ...headers }, body })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(data?.error?.message || text || `Google Drive API failed (${response.status}).`)
  return data
}

async function googleDriveBytes(url, accessToken) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Google Drive API failed (${response.status}).`)
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  }
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/)
  if (!match) throw new Error('Invalid photo data URL.')
  return Buffer.from(match[3], 'base64')
}

function safeFileName(name) {
  const trimmed = String(name || 'photo.jpg').trim().replace(/[\\/:*?"<>|]+/g, '-')
  return trimmed || 'photo.jpg'
}

async function uploadPhotoToGoogle({ shopId, photoId, fileName, mimeType, dataUrl }, storageConfig) {
  const normalizedShopId = normalizeShopId(shopId)
  const { accessToken } = await getDriveAccessTokenForShop(normalizedShopId)
  const finalFileName = `${normalizedShopId}__${String(photoId || 'photo').trim()}__${safeFileName(fileName)}`
  const contentType = String(mimeType || 'image/jpeg').trim() || 'image/jpeg'
  const buffer = dataUrlToBuffer(dataUrl)
  const boundary = `phonedukaan-${Date.now().toString(36)}`
  const metadata = { name: finalFileName, parents: [storageConfig.driveFolderId] }

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`, 'utf8'),
    Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`, 'utf8'),
    buffer,
    Buffer.from(`\r\n--${boundary}--`, 'utf8'),
  ])

  const upload = await googleDriveJson('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
    accessToken,
  })

  try {
    await googleDriveJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(upload.id)}/permissions?supportsAllDrives=true&sendNotificationEmail=false`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'anyone', role: 'reader' }),
      accessToken,
    })
  } catch {
    // ignore sharing errors
  }

  return {
    photoId,
    fileId: upload.id,
    fileName: upload.name || finalFileName,
    mimeType: upload.mimeType || contentType,
    size: Number(upload.size || buffer.length),
    uploadedAt: new Date().toISOString(),
    fileUrl: buildDrivePreviewUrl(upload.id),
    openUrl: upload.webViewLink || '',
  }
}

async function downloadPhotoFromGoogle(fileId, storageConfig) {
  const { accessToken } = await getDriveAccessTokenForShop(storageConfig.shopId || storageConfig.shop_id || '')
  const metadata = await googleDriveJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(String(fileId || ''))}?supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink`, { accessToken })
  const { buffer, contentType } = await googleDriveBytes(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(String(fileId || ''))}?supportsAllDrives=true&alt=media`, accessToken)
  const mimeType = metadata.mimeType || contentType || 'application/octet-stream'
  return {
    fileId: metadata.id,
    fileName: metadata.name || 'photo',
    mimeType,
    size: Number(metadata.size || buffer.length),
    dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
    fileUrl: buildDrivePreviewUrl(metadata.id),
    openUrl: metadata.webViewLink || '',
  }
}

async function forwardToGoogleStorage({ action, shopId, payload }, storageConfig) {
  const normalizedAction = String(action || 'status')
  const normalizedShopId = normalizeShopId(shopId)
  const cachePrefix = `shop:${storageConfig.spreadsheetId}:${normalizedShopId}`

  if (normalizedAction === 'status') {
    return withReadCache(`${cachePrefix}:status`, 5000, async () => {
      const data = await readShopStatus(normalizedShopId, storageConfig)
      return {
        ok: true,
        shopId: normalizedShopId,
        hasData: data.hasData,
        hasShop: data.hasShop,
        savedAt: data.savedAt || '',
      }
    })
  }

  if (normalizedAction === 'pull') {
    return withReadCache(`${cachePrefix}:pull`, 10000, async () => {
      const data = await readShopPayload(normalizedShopId, storageConfig)
      return { ok: true, shopId: normalizedShopId, savedAt: data.savedAt || '', data }
    })
  }

  if (normalizedAction === 'push') {
    if (!payload || !Array.isArray(payload.inv) || !Array.isArray(payload.tx)) {
      throw new Error('Payload must include inv and tx arrays.')
    }
    const nextPayload = {
      version: Number(payload.version || 3),
      savedAt: new Date().toISOString(),
      inv: Array.isArray(payload.inv) ? payload.inv : [],
      tx: Array.isArray(payload.tx) ? payload.tx : [],
      shop: payload.shop && typeof payload.shop === 'object' ? payload.shop : {},
    }
    await writeShopPayload(normalizedShopId, nextPayload, storageConfig)
    invalidateReadCache([cachePrefix])
    return { ok: true, shopId: normalizedShopId, savedAt: nextPayload.savedAt }
  }

  if (normalizedAction === 'uploadPhoto') {
    if (!payload?.photoId || !payload?.dataUrl) throw new Error('Photo payload must include photoId and dataUrl.')
    const photo = await uploadPhotoToGoogle({ shopId: normalizedShopId, photoId: payload.photoId, fileName: payload.fileName, mimeType: payload.mimeType, dataUrl: payload.dataUrl }, storageConfig)
    invalidateReadCache([cachePrefix])
    return { ok: true, shopId: normalizedShopId, photo }
  }

  if (normalizedAction === 'downloadPhoto') {
    if (!payload?.fileId) throw new Error('Photo payload must include fileId.')
    const photo = await downloadPhotoFromGoogle(payload.fileId, storageConfig)
    return { ok: true, shopId: normalizedShopId, photo }
  }

  throw new Error('Unknown action.')
}

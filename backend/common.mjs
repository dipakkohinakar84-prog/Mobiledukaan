import crypto from 'node:crypto'

const ADMIN_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7
const SHOP_STORAGE_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30
const DRIVE_OAUTH_STATE_TTL_MS = 1000 * 60 * 10

export function normalizeShopId(shopId) {
  const value = String(shopId || 'main-shop').trim().replace(/[^a-zA-Z0-9_-]/g, '-')
  return value || 'main-shop'
}

export function sha256hex(value) {
  return crypto.createHash('sha256').update(String(value || '').trim()).digest('hex')
}

let _adminCredWarned = false
export function getAdminCredentials() {
  const id = String(process.env.PHONEDUKAAN_ADMIN_ID || '').trim()
  const password = String(process.env.PHONEDUKAAN_ADMIN_PASSWORD || '').trim()
  if (!id || !password) {
    if (!_adminCredWarned) {
      _adminCredWarned = true
      console.warn('[SECURITY] PHONEDUKAAN_ADMIN_ID and PHONEDUKAAN_ADMIN_PASSWORD environment variables are not set. Set them in .env to secure the admin panel.')
    }
    return { id: id || 'admin', password: password || 'admin123' }
  }
  return { id, password }
}

function getAdminTokenSecret() {
  const { id, password } = getAdminCredentials()
  const registryUrl = String(process.env.PHONEDUKAAN_REGISTRY_APPS_SCRIPT_URL || '').trim()
  const adminSecret = String(process.env.APPS_SCRIPT_ADMIN_SECRET || '').trim()
  return [id, password, registryUrl, adminSecret].join('|')
}

function getShopStorageTokenSecret() {
  const explicit = String(process.env.PHONEDUKAAN_SHOP_TOKEN_SECRET || '').trim()
  if (explicit) return explicit
  return sha256hex(`${getAdminTokenSecret()}|shop-storage`)
}

function getDriveOAuthStateSecret() {
  const explicit = String(process.env.PHONEDUKAAN_DRIVE_OAUTH_STATE_SECRET || '').trim()
  if (explicit) return explicit
  return sha256hex(`${getAdminTokenSecret()}|drive-oauth-state`)
}

export function createAdminToken() {
  const payload = JSON.stringify({ exp: Date.now() + ADMIN_TOKEN_TTL_MS })
  const encodedPayload = Buffer.from(payload).toString('base64url')
  const signature = crypto.createHmac('sha256', getAdminTokenSecret()).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

export function verifyAdminToken(token) {
  const normalized = String(token || '').trim()
  if (!normalized.includes('.')) return false
  const [payload, signature] = normalized.split('.')
  if (!payload || !signature) return false
  const expected = crypto.createHmac('sha256', getAdminTokenSecret()).update(payload).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return Number(parsed.exp || 0) > Date.now()
  } catch {
    return false
  }
}

export function createShopStorageToken(storage) {
  const iv = crypto.randomBytes(12)
  const key = crypto.createHash('sha256').update(getShopStorageTokenSecret()).digest()
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const payload = JSON.stringify({ exp: Date.now() + SHOP_STORAGE_TOKEN_TTL_MS, storage })
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function readShopStorageToken(token) {
  const normalized = String(token || '').trim()
  const parts = normalized.split('.')
  if (parts.length !== 3) throw new Error('Invalid shop storage token.')
  const [ivPart, tagPart, dataPart] = parts
  const iv = Buffer.from(ivPart, 'base64url')
  const tag = Buffer.from(tagPart, 'base64url')
  const encrypted = Buffer.from(dataPart, 'base64url')
  const key = crypto.createHash('sha256').update(getShopStorageTokenSecret()).digest()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  const parsed = JSON.parse(decrypted)
  if (Number(parsed.exp || 0) <= Date.now()) throw new Error('Shop storage token expired.')
  return parsed.storage || null
}

export function sealSecret(value) {
  const iv = crypto.randomBytes(12)
  const key = crypto.createHash('sha256').update(getShopStorageTokenSecret()).digest()
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(String(value || ''), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function openSecret(token) {
  const normalized = String(token || '').trim()
  if (!normalized) return ''
  const parts = normalized.split('.')
  if (parts.length !== 3) return normalized
  const [ivPart, tagPart, dataPart] = parts
  const iv = Buffer.from(ivPart, 'base64url')
  const tag = Buffer.from(tagPart, 'base64url')
  const encrypted = Buffer.from(dataPart, 'base64url')
  const key = crypto.createHash('sha256').update(getShopStorageTokenSecret()).digest()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function createDriveOAuthStateToken(payload) {
  const data = JSON.stringify({ exp: Date.now() + DRIVE_OAUTH_STATE_TTL_MS, payload })
  const encoded = Buffer.from(data).toString('base64url')
  const signature = crypto.createHmac('sha256', getDriveOAuthStateSecret()).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function readDriveOAuthStateToken(token) {
  const normalized = String(token || '').trim()
  if (!normalized.includes('.')) throw new Error('Invalid OAuth state token.')
  const [payload, signature] = normalized.split('.')
  const expected = crypto.createHmac('sha256', getDriveOAuthStateSecret()).update(payload).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Invalid OAuth state token.')
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (Number(parsed.exp || 0) <= Date.now()) throw new Error('OAuth state token expired.')
  return parsed.payload || null
}

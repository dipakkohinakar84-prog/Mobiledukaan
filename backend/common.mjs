import crypto from 'node:crypto'

const ADMIN_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7

export function normalizeShopId(shopId) {
  const value = String(shopId || 'main-shop').trim().replace(/[^a-zA-Z0-9_-]/g, '-')
  return value || 'main-shop'
}

export function sha256hex(value) {
  return crypto.createHash('sha256').update(String(value || '').trim()).digest('hex')
}

let _adminCredWarned = false
export function hasConfiguredAdminCredentials() {
  const id = String(process.env.PHONEDUKAAN_ADMIN_ID || '').trim()
  const password = String(process.env.PHONEDUKAAN_ADMIN_PASSWORD || '').trim()
  if (!id || !password) return false
  return !(id === 'admin' && password === 'admin123')
}

export function getAdminCredentials() {
  const id = String(process.env.PHONEDUKAAN_ADMIN_ID || '').trim()
  const password = String(process.env.PHONEDUKAAN_ADMIN_PASSWORD || '').trim()
  if (!hasConfiguredAdminCredentials()) {
    if (!_adminCredWarned) {
      _adminCredWarned = true
      console.warn('[SECURITY] Set PHONEDUKAAN_ADMIN_ID and PHONEDUKAAN_ADMIN_PASSWORD to strong non-default values in .env to enable the admin panel securely.')
    }
    return { id: '', password: '' }
  }
  return { id, password }
}

function getAdminTokenSecret() {
  const { id, password } = getAdminCredentials()
  const registryUrl = String(process.env.PHONEDUKAAN_REGISTRY_APPS_SCRIPT_URL || '').trim()
  const adminSecret = String(process.env.APPS_SCRIPT_ADMIN_SECRET || '').trim()
  return [id, password, registryUrl, adminSecret].join('|')
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

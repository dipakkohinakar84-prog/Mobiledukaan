export { createAdminToken, getAdminCredentials, hasConfiguredAdminCredentials, normalizeShopId, sha256hex, verifyAdminToken } from '../../backend/common.mjs'
export { authShop, getSyncRuntimeConfig, listShops, syncAction, upsertShop } from '../../backend/storage.mjs'

export function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export function readBearerToken(event) {
  return String(event.headers?.authorization || event.headers?.Authorization || '').replace(/^Bearer\s+/i, '').trim()
}

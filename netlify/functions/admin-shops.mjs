import { json, listShops, normalizeShopId, readBearerToken, sha256hex, upsertShop, verifyAdminToken } from './_shared.mjs'

export const handler = async (event) => {
  const token = readBearerToken(event)
  if (!token || !verifyAdminToken(token)) {
    return json(401, { ok: false, error: 'Admin login required.' })
  }

  try {
    if (event.httpMethod === 'GET') {
      const data = await listShops()
      return json(200, data)
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}')
      const loginId = String(body.loginId || '').trim()
      const password = String(body.password || '').trim()
      const shopId = normalizeShopId(body.shopId)

      if (!loginId || !password || !shopId) {
        return json(400, { ok: false, error: 'Shop ID, login ID, and password are required.' })
      }

      const data = await upsertShop({
        shopId,
        shopName: String(body.shopName || '').trim(),
        loginId,
        passwordHash: sha256hex(password),
        syncKey: String(body.syncKey || '').trim(),
        serviceAccountEmail: String(body.serviceAccountEmail || '').trim(),
        privateKey: String(body.privateKey || ''),
        spreadsheetId: String(body.spreadsheetId || '').trim(),
        driveFolderId: String(body.driveFolderId || '').trim(),
      })

      return json(200, data)
    }

    return json(405, { ok: false, error: 'Method not allowed.' })
  } catch (error) {
    return json(502, { ok: false, error: error instanceof Error ? error.message : 'Unable to save shop config.' })
  }
}

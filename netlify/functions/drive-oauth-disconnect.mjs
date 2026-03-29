import { disconnectDriveOAuth, json, normalizeShopId, readShopStorageToken } from './_shared.mjs'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' })

  try {
    const body = JSON.parse(event.body || '{}')
    const storageToken = String(body.storageToken || '').trim()
    const shopId = normalizeShopId(body.shopId)
    if (!storageToken || !shopId) return json(400, { ok: false, error: 'Shop login required.' })
    const tokenData = readShopStorageToken(storageToken)
    if (tokenData?.shopId && normalizeShopId(tokenData.shopId) !== shopId) return json(403, { ok: false, error: 'Shop token mismatch.' })
    return json(200, await disconnectDriveOAuth({ shopId }))
  } catch (error) {
    return json(400, { ok: false, error: error instanceof Error ? error.message : 'Unable to disconnect Drive.' })
  }
}

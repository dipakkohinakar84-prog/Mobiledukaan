import { authShop, json, sha256hex } from './_shared.mjs'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' })
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const loginId = String(body.loginId || '').trim()
    const password = String(body.password || '').trim()

    if (!loginId || !password) {
      return json(400, { ok: false, error: 'Login ID and password are required.' })
    }

    const data = await authShop({ loginId, passwordHash: sha256hex(password) })

    return json(200, data)
  } catch (error) {
    return json(401, { ok: false, error: error instanceof Error ? error.message : 'Shop login failed.' })
  }
}

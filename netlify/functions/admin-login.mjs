import { createAdminToken, getAdminCredentials, json } from './_shared.mjs'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' })
  }

  const body = JSON.parse(event.body || '{}')
  const { id, password } = getAdminCredentials()
  const inputId = String(body.loginId || '').trim()
  const inputPassword = String(body.password || '').trim()

  if (inputId === id && inputPassword === password) {
    return json(200, { ok: true, token: createAdminToken() })
  }

  return json(401, { ok: false, error: 'Invalid admin credentials.' })
}

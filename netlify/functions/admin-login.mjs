import crypto from 'node:crypto'

import { createAdminToken, getAdminCredentials, hasConfiguredAdminCredentials, json } from './_shared.mjs'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' })
  }

  if (!hasConfiguredAdminCredentials()) {
    return json(503, { ok: false, error: 'Admin login is not configured on the server.' })
  }

  const body = JSON.parse(event.body || '{}')
  const { id, password } = getAdminCredentials()
  const inputId = String(body.loginId || '').trim()
  const inputPassword = String(body.password || '').trim()

  const idMatch = inputId.length === id.length && crypto.timingSafeEqual(Buffer.from(inputId), Buffer.from(id))
  const pwMatch = inputPassword.length === password.length && crypto.timingSafeEqual(Buffer.from(inputPassword), Buffer.from(password))

  if (idMatch && pwMatch) {
    return json(200, { ok: true, token: createAdminToken() })
  }

  return json(401, { ok: false, error: 'Invalid admin credentials.' })
}

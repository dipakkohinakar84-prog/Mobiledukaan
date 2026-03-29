import { json, syncAction } from './_shared.mjs'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' })
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const data = await syncAction(body)
    return json(200, data)
  } catch (error) {
    return json(502, { ok: false, error: error instanceof Error ? error.message : 'Proxy request failed.' })
  }
}

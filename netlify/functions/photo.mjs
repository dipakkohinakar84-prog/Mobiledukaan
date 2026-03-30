import { getPhotoPreviewStream, json, normalizeShopId } from './_shared.mjs'

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed.' })

  try {
    const fileId = String(event.queryStringParameters?.fileId || '').trim()
    const shopId = normalizeShopId(event.queryStringParameters?.shopId)
    const storageToken = String(event.queryStringParameters?.storageToken || '').trim()
    const photo = await getPhotoPreviewStream({ storageToken, fileId, shopId })
    return {
      statusCode: 200,
      headers: {
        'Content-Type': photo.contentType,
        'Cache-Control': 'private, max-age=300',
      },
      body: photo.buffer.toString('base64'),
      isBase64Encoded: true,
    }
  } catch (error) {
    return json(502, { ok: false, error: error instanceof Error ? error.message : 'Unable to load photo.' })
  }
}

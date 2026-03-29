import { exchangeDriveOAuthCode, getGoogleProfileEmail, json, readDriveOAuthStateToken, storeDriveOAuthTokens } from './_shared.mjs'

export const handler = async (event) => {
  const redirectBase = `https://${event.headers.host}`
  const fail = (message, returnTo = '/') => {
    const target = new URL(returnTo || '/', redirectBase)
    target.searchParams.set('drive_oauth', 'error')
    target.searchParams.set('message', message)
    return {
      statusCode: 302,
      headers: { Location: target.toString() },
      body: '',
    }
  }

  try {
    const code = String(event.queryStringParameters?.code || '').trim()
    const state = String(event.queryStringParameters?.state || '').trim()
    if (!code || !state) return fail('Missing Google OAuth response.')
    const parsedState = readDriveOAuthStateToken(state)
    const tokenData = await exchangeDriveOAuthCode({ code })
    const email = await getGoogleProfileEmail(tokenData.access_token)
    await storeDriveOAuthTokens({ shopId: parsedState.shopId, refreshToken: tokenData.refresh_token || '', email })
    const target = new URL(parsedState.returnTo || '/', redirectBase)
    target.searchParams.set('drive_oauth', 'success')
    target.searchParams.set('email', email)
    return { statusCode: 302, headers: { Location: target.toString() }, body: '' }
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Google Drive connection failed.')
  }
}

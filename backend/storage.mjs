const postActions = new Set(['authShop', 'listShops', 'upsertShop', 'push', 'uploadPhoto', 'downloadPhoto'])

export function getRegistryScriptUrl() {
  return String(process.env.PHONEDUKAAN_REGISTRY_APPS_SCRIPT_URL || '').trim()
}

export function getSyncRuntimeConfig() {
  const defaultUrl = String(process.env.APPS_SCRIPT_WEB_APP_URL || '').trim()
  return {
    ok: true,
    storageMode: 'apps-script',
    hasDefaultUrl: Boolean(defaultUrl),
    defaultUrl,
    hasDefaultSyncKey: Boolean(String(process.env.APPS_SCRIPT_SYNC_KEY || '').trim()),
    requiresScriptUrl: true,
    syncTargetLabel: 'Apps Script',
  }
}

export async function authShop({ loginId, passwordHash }) {
  return forwardRegistryAction({
    action: 'authShop',
    payload: { loginId, passwordHash },
  })
}

export async function listShops() {
  if (!String(process.env.APPS_SCRIPT_ADMIN_SECRET || '').trim()) {
    throw new Error('APPS_SCRIPT_ADMIN_SECRET is not configured on the server.')
  }
  return forwardRegistryAction({
    action: 'listShops',
    payload: { adminSecret: String(process.env.APPS_SCRIPT_ADMIN_SECRET || '').trim() },
  })
}

export async function upsertShop({ shopId, shopName, loginId, passwordHash, scriptUrl, syncKey }) {
  if (!String(process.env.APPS_SCRIPT_ADMIN_SECRET || '').trim()) {
    throw new Error('APPS_SCRIPT_ADMIN_SECRET is not configured on the server.')
  }
  return forwardRegistryAction({
    action: 'upsertShop',
    payload: {
      adminSecret: String(process.env.APPS_SCRIPT_ADMIN_SECRET || '').trim(),
      shop: {
        shopId,
        shopName,
        loginId,
        passwordHash,
        scriptUrl,
        syncKey,
      },
    },
  })
}

export async function syncAction(input) {
  return forwardToAppsScript(input || {})
}

export function normalizeScriptUrl(scriptUrl) {
  const trimmed = String(scriptUrl || process.env.APPS_SCRIPT_WEB_APP_URL || '').trim()
  if (!trimmed) throw new Error('Apps Script URL is required.')
  const url = new URL(trimmed)
  if (url.protocol !== 'https:') throw new Error('Apps Script URL must use HTTPS.')
  if (url.hostname !== 'script.google.com') throw new Error('Only official Google Apps Script web app URLs are allowed.')
  if (!/^\/macros\/s\/[A-Za-z0-9_-]+\/(exec|dev)$/.test(url.pathname)) {
    throw new Error('Apps Script URL must be a valid Google web app /exec or /dev URL.')
  }
  return url.toString()
}

export async function parseAppsScriptResponse(response) {
  const text = await response.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    if (text.includes('accounts.google.com') || text.includes('Sign in')) {
      throw new Error('Apps Script is redirecting to Google sign-in. Redeploy the web app with access set to Anyone.')
    }
    throw new Error(`Apps Script returned non-JSON output (${response.status}).`)
  }
  if (!response.ok) throw new Error(data?.error || `Apps Script request failed (${response.status}).`)
  if (data?.ok === false) throw new Error(data.error || 'Apps Script rejected the request.')
  return data
}

export async function forwardToAppsScript({ action, scriptUrl, shopId, syncKey, payload }) {
  const normalizedAction = String(action || 'status')
  const normalizedUrl = normalizeScriptUrl(scriptUrl)
  const normalizedShopId = normalizeShopId(shopId)
  const normalizedSyncKey = String(syncKey || process.env.APPS_SCRIPT_SYNC_KEY || '')

  if (postActions.has(normalizedAction)) {
    const response = await fetch(normalizedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: normalizedAction,
        shopId: normalizedShopId,
        syncKey: normalizedSyncKey,
        payload,
      }),
      redirect: 'follow',
      cache: 'no-store',
    })
    return parseAppsScriptResponse(response)
  }

  const params = new URLSearchParams({ action: normalizedAction, shopId: normalizedShopId })
  if (normalizedSyncKey) params.set('syncKey', normalizedSyncKey)
  const separator = normalizedUrl.includes('?') ? '&' : '?'
  const response = await fetch(`${normalizedUrl}${separator}${params.toString()}`, {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store',
  })
  return parseAppsScriptResponse(response)
}

export async function forwardRegistryAction({ action, payload }) {
  const scriptUrl = getRegistryScriptUrl()
  if (!scriptUrl) throw new Error('PHONEDUKAAN_REGISTRY_APPS_SCRIPT_URL is required.')
  return forwardToAppsScript({
    action,
    scriptUrl,
    shopId: payload?.shopId || 'registry',
    syncKey: payload?.syncKey || '',
    payload,
  })
}

function normalizeShopId(shopId) {
  const value = String(shopId || 'main-shop').trim().replace(/[^a-zA-Z0-9_-]/g, '-')
  return value || 'main-shop'
}

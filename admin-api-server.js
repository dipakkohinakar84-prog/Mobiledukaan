import http from 'node:http'
import crypto from 'node:crypto'
import PocketBase, { BaseAuthStore } from 'pocketbase'

const PORT = Number(process.env.ADMIN_API_PORT || 8787)
const PB_URL = String(process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || '').trim()
const COOKIE_NAME = 'pd_admin_session'
const COOKIE_SECURE = String(process.env.ADMIN_API_COOKIE_SECURE || (process.env.NODE_ENV === 'development' ? 'false' : 'true')).toLowerCase() !== 'false'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const sessions = new Map()

if (!PB_URL) {
  console.error('Missing POCKETBASE_URL or VITE_POCKETBASE_URL environment variable.')
  process.exit(1)
}

function createPocketBase(auth) {
  const pb = new PocketBase(PB_URL)
  pb.autoCancellation(false)
  pb.authStore = new BaseAuthStore()
  if (auth?.token && auth?.record) pb.authStore.save(auth.token, auth.record)
  return pb
}

function normalizeMobileNumber(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeShopId(value = '') {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-')
}

function buildShopUserEmail(loginId, shopId) {
  const safe = String(shopId || loginId || 'shop').toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'shop'
  return `${safe}@users.phonedukaan.local`
}

function computeTrialDaysValue(value) {
  return Math.max(1, Number(value || 7) || 7)
}

async function resolveTrialDays(pb) {
  try {
    const result = await pb.collection('app_settings').getList(1, 1, { sort: '-created' })
    return computeTrialDaysValue(result?.items?.[0]?.trialDays)
  } catch {
    return 7
  }
}

function parseCookies(cookieHeader = '') {
  return String(cookieHeader || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf('=')
      if (index === -1) return acc
      acc[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1))
      return acc
    }, {})
}

function setCookie(res, value, maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (COOKIE_SECURE) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

function clearCookie(res) {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0']
  if (COOKIE_SECURE) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => {
      raw += chunk
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large.'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Invalid JSON body.'))
      }
    })
    req.on('error', reject)
  })
}

function createSession(auth) {
  const sessionId = crypto.randomBytes(32).toString('hex')
  const csrfToken = crypto.randomBytes(24).toString('hex')
  sessions.set(sessionId, {
    token: auth.token,
    record: auth.record,
    csrfToken,
    expiresAt: Date.now() + SESSION_TTL_MS,
  })
  return { sessionId, csrfToken }
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie || '')
  const sessionId = cookies[COOKIE_NAME]
  if (!sessionId) return null
  const session = sessions.get(sessionId)
  if (!session) return null
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId)
    return null
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS
  return { sessionId, session }
}

function requireSession(req, res, { requireCsrf = false } = {}) {
  const wrapped = getSession(req)
  if (!wrapped) {
    sendJson(res, 401, { message: 'Admin session required.' })
    return null
  }
  if (requireCsrf && req.headers['x-admin-csrf'] !== wrapped.session.csrfToken) {
    sendJson(res, 403, { message: 'Invalid admin CSRF token.' })
    return null
  }
  return wrapped
}

function mapDashboard(shops, users, settingsRecord, trialDays) {
  const shopsById = new Map(shops.map((shop) => [String(shop.id), shop]))
  const usersByShop = new Map()
  const usersMapped = users.map((user) => {
    const shop = user.shop ? shopsById.get(String(user.shop)) : null
    if (shop) usersByShop.set(String(shop.id), user)
    return {
      id: user.id,
      mobileNumber: user.username || '',
      email: user.email || '',
      active: user.active !== false,
      trialEndsAt: user.trialEndsAt || '',
      createdAt: user.created || '',
      updatedAt: user.updated || '',
      shopRecordId: user.shop || '',
      shopId: shop?.shopId || shop?.id || '',
      shopName: shop?.name || shop?.shopId || '',
    }
  })

  const shopsMapped = shops.map((shop) => {
    const user = usersByShop.get(String(shop.id))
    return {
      id: shop.id,
      shopId: shop.shopId || shop.id,
      shopName: shop.name || shop.shopId || shop.id,
      email: shop.email || user?.email || '',
      phone: shop.phone || user?.username || '',
      userId: user?.id || '',
      loginId: user?.username || '',
      trialEndsAt: user?.trialEndsAt || '',
      active: user?.active !== false,
      createdAt: shop.created || '',
      updatedAt: shop.updated || '',
    }
  })

  return {
    users: usersMapped,
    shops: shopsMapped,
    settings: {
      id: settingsRecord?.id || '',
      trialDays,
    },
  }
}

async function loadDashboard(pb) {
  const [shops, users, settingsResult, trialDays] = await Promise.all([
    pb.collection('shops').getFullList({ sort: '-created' }),
    pb.collection('shop_users').getFullList({ sort: '-created' }),
    pb.collection('app_settings').getList(1, 1, { sort: '-created' }).catch(() => ({ items: [] })),
    resolveTrialDays(pb),
  ])
  return mapDashboard(shops, users, settingsResult?.items?.[0], trialDays)
}

async function saveAdminShop(pb, form) {
  const normalizedShopId = normalizeShopId(form.shopId)
  const loginId = normalizeMobileNumber(form.loginId) || String(form.loginId || '').trim()
  const password = String(form.password || '').trim()
  if (!normalizedShopId || !loginId || !password) throw new Error('Shop ID, shop login ID, and password are required.')

  let shop = null
  try { shop = await pb.collection('shops').getFirstListItem(`shopId="${normalizedShopId.replace(/"/g, '\\"')}"`) } catch (error) { if (error?.status !== 404) throw error }
  const shopPayload = { shopId: normalizedShopId, name: String(form.shopName || normalizedShopId).trim() || normalizedShopId }
  shop = shop ? await pb.collection('shops').update(shop.id, shopPayload) : await pb.collection('shops').create(shopPayload)

  let user = null
  try { user = await pb.collection('shop_users').getFirstListItem(`username="${loginId.replace(/"/g, '\\"')}"`) } catch (error) { if (error?.status !== 404) throw error }
  const userPayload = {
    username: loginId,
    email: buildShopUserEmail(loginId, normalizedShopId),
    emailVisibility: false,
    password,
    passwordConfirm: password,
    shop: shop.id,
    active: true,
  }
  user = user ? await pb.collection('shop_users').update(user.id, userPayload) : await pb.collection('shop_users').create(userPayload)
  return { ok: true, shop: { shopId: normalizedShopId, shopName: shop.name, loginId: user.username } }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (!url.pathname.startsWith('/admin-api/')) {
    sendJson(res, 404, { message: 'Not found.' })
    return
  }

  try {
    if (req.method === 'POST' && url.pathname === '/admin-api/login') {
      const body = await readJsonBody(req)
      const loginId = String(body.loginId || '').trim()
      const password = String(body.password || '').trim()
      if (!loginId || !password) {
        sendJson(res, 400, { message: 'Admin ID and password are required.' })
        return
      }
      const pb = createPocketBase()
      const auth = await pb.collection('_superusers').authWithPassword(loginId, password)
      const session = createSession(auth)
      setCookie(res, session.sessionId)
      sendJson(res, 200, { data: { authenticated: true, csrfToken: session.csrfToken } })
      return
    }

    if (req.method === 'GET' && url.pathname === '/admin-api/session') {
      const wrapped = requireSession(req, res)
      if (!wrapped) return
      sendJson(res, 200, { data: { authenticated: true, csrfToken: wrapped.session.csrfToken } })
      return
    }

    if (req.method === 'POST' && url.pathname === '/admin-api/logout') {
      const wrapped = requireSession(req, res, { requireCsrf: true })
      if (!wrapped) return
      sessions.delete(wrapped.sessionId)
      clearCookie(res)
      sendJson(res, 200, { data: { ok: true } })
      return
    }

    const wrapped = requireSession(req, res, { requireCsrf: req.method !== 'GET' })
    if (!wrapped) return
    const pb = createPocketBase({ token: wrapped.session.token, record: wrapped.session.record })

    if (req.method === 'GET' && url.pathname === '/admin-api/dashboard') {
      const dashboard = await loadDashboard(pb)
      sendJson(res, 200, { data: dashboard })
      return
    }

    if (req.method === 'POST' && url.pathname === '/admin-api/shops') {
      const body = await readJsonBody(req)
      const result = await saveAdminShop(pb, body)
      sendJson(res, 200, { data: result })
      return
    }

    const userMatch = url.pathname.match(/^\/admin-api\/users\/([^/]+)$/)
    if (req.method === 'PATCH' && userMatch) {
      const body = await readJsonBody(req)
      const payload = {}
      if (body.mobileNumber !== undefined) {
        const mobileNumber = normalizeMobileNumber(body.mobileNumber)
        if (mobileNumber.length !== 10) throw new Error('Enter a valid 10-digit mobile number.')
        payload.username = mobileNumber
      }
      if (body.email !== undefined) payload.email = normalizeEmail(body.email)
      if (body.active !== undefined) payload.active = !!body.active
      if (body.trialEndsAt !== undefined) payload.trialEndsAt = body.trialEndsAt || null
      if (!Object.keys(payload).length) throw new Error('No changes to save.')
      const record = await pb.collection('shop_users').update(decodeURIComponent(userMatch[1]), payload)
      sendJson(res, 200, { data: record })
      return
    }

    const userTrialMatch = url.pathname.match(/^\/admin-api\/users\/([^/]+)\/extend-trial$/)
    if (req.method === 'POST' && userTrialMatch) {
      const body = await readJsonBody(req)
      const days = Math.max(1, Number(body.days || 0))
      const userId = decodeURIComponent(userTrialMatch[1])
      const user = await pb.collection('shop_users').getOne(userId)
      const baseDate = Date.parse(String(user?.trialEndsAt || ''))
      const anchor = Number.isFinite(baseDate) && baseDate > Date.now() ? new Date(baseDate) : new Date()
      anchor.setDate(anchor.getDate() + days)
      const record = await pb.collection('shop_users').update(userId, { trialEndsAt: anchor.toISOString() })
      sendJson(res, 200, { data: record })
      return
    }

    const shopMatch = url.pathname.match(/^\/admin-api\/shops\/([^/]+)$/)
    if (req.method === 'PATCH' && shopMatch) {
      const body = await readJsonBody(req)
      const payload = {}
      if (body.shopName !== undefined) payload.name = String(body.shopName || '').trim()
      if (body.phone !== undefined) payload.phone = String(body.phone || '').trim()
      if (body.email !== undefined) payload.email = normalizeEmail(body.email)
      if (!Object.keys(payload).length) throw new Error('No changes to save.')
      const record = await pb.collection('shops').update(decodeURIComponent(shopMatch[1]), payload)
      sendJson(res, 200, { data: record })
      return
    }

    if (req.method === 'PUT' && url.pathname === '/admin-api/settings') {
      const body = await readJsonBody(req)
      const nextTrialDays = computeTrialDaysValue(body?.trialDays)
      const current = await pb.collection('app_settings').getList(1, 1, { sort: '-created' }).catch(() => ({ items: [] }))
      const payload = { trialDays: nextTrialDays }
      const record = current?.items?.[0]?.id
        ? await pb.collection('app_settings').update(current.items[0].id, payload)
        : await pb.collection('app_settings').create(payload)
      sendJson(res, 200, { data: record })
      return
    }

    if (req.method === 'POST' && url.pathname === '/admin-api/password-reset') {
      const body = await readJsonBody(req)
      const email = normalizeEmail(body.email)
      if (!email) throw new Error('Email is required.')
      await pb.collection('shop_users').requestPasswordReset(email)
      sendJson(res, 200, { data: { ok: true } })
      return
    }

    sendJson(res, 404, { message: 'Not found.' })
  } catch (error) {
    const status = Number(error?.status || error?.response?.status || 400)
    const message = String(error?.response?.message || error?.message || 'Admin API request failed.')
    sendJson(res, status >= 400 && status < 600 ? status : 500, { message })
  }
})

server.listen(PORT, () => {
  console.log(`Admin API listening on http://127.0.0.1:${PORT}`)
})

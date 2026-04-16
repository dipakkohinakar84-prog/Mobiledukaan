import http from 'node:http'
import crypto from 'node:crypto'
import PocketBase, { BaseAuthStore } from 'pocketbase'

const PORT = Number(process.env.ADMIN_API_PORT || 8787)
const PB_URL = String(process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || '').trim()
const SESSION_TTL_MS = 60 * 60 * 1000
const ALLOWED_ORIGINS = String(process.env.ADMIN_API_ALLOWED_ORIGINS || 'https://phonedukaan.kohnex.com')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
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

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  })
  res.end(JSON.stringify(payload))
}

function corsHeaders(req) {
  const origin = String(req.headers.origin || '')
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
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
  const sessionToken = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + SESSION_TTL_MS
  sessions.set(sessionToken, {
    token: auth.token,
    record: auth.record,
    expiresAt,
  })
  return { sessionToken, expiresAt }
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || '')
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] || ''
}

function requireSession(req, res) {
  const sessionToken = getBearerToken(req)
  if (!sessionToken) {
    sendJson(res, 401, { message: 'Admin session required.' }, corsHeaders(req))
    return null
  }
  const session = sessions.get(sessionToken)
  if (!session) {
    sendJson(res, 401, { message: 'Invalid or expired admin session.' }, corsHeaders(req))
    return null
  }
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionToken)
    sendJson(res, 401, { message: 'Admin session expired. Please log in again.' }, corsHeaders(req))
    return null
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS
  return { sessionToken, session }
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
  const headers = corsHeaders(req)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (!url.pathname.startsWith('/admin-api/')) {
    sendJson(res, 404, { message: 'Not found.' }, headers)
    return
  }

  try {
    if (req.method === 'POST' && url.pathname === '/admin-api/login') {
      const body = await readJsonBody(req)
      const loginId = String(body.loginId || '').trim()
      const password = String(body.password || '').trim()
      if (!loginId || !password) {
        sendJson(res, 400, { message: 'Admin ID and password are required.' }, headers)
        return
      }
      const pb = createPocketBase()
      const auth = await pb.collection('_superusers').authWithPassword(loginId, password)
      const session = createSession(auth)
      sendJson(res, 200, { data: { authenticated: true, sessionToken: session.sessionToken, expiresAt: session.expiresAt } }, headers)
      return
    }

    if (req.method === 'GET' && url.pathname === '/admin-api/healthz') {
      sendJson(res, 200, {
        data: {
          ok: true,
          service: 'admin-api',
          pocketbaseUrlConfigured: Boolean(PB_URL),
          uptimeSeconds: Math.round(process.uptime()),
          checkedAt: new Date().toISOString(),
        },
      }, headers)
      return
    }

    const wrapped = requireSession(req, res)
    if (!wrapped) return
    const pb = createPocketBase({ token: wrapped.session.token, record: wrapped.session.record })

    if (req.method === 'GET' && url.pathname === '/admin-api/session') {
      sendJson(res, 200, { data: { authenticated: true, sessionToken: wrapped.sessionToken, expiresAt: wrapped.session.expiresAt } }, headers)
      return
    }

    if (req.method === 'POST' && url.pathname === '/admin-api/logout') {
      sessions.delete(wrapped.sessionToken)
      sendJson(res, 200, { data: { ok: true } }, headers)
      return
    }

    if (req.method === 'GET' && url.pathname === '/admin-api/dashboard') {
      const dashboard = await loadDashboard(pb)
      sendJson(res, 200, { data: dashboard }, headers)
      return
    }

    if (req.method === 'POST' && url.pathname === '/admin-api/shops') {
      const body = await readJsonBody(req)
      const result = await saveAdminShop(pb, body)
      sendJson(res, 200, { data: result }, headers)
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
      sendJson(res, 200, { data: record }, headers)
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
      sendJson(res, 200, { data: record }, headers)
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
      sendJson(res, 200, { data: record }, headers)
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
      sendJson(res, 200, { data: record }, headers)
      return
    }

    if (req.method === 'POST' && url.pathname === '/admin-api/password-reset') {
      const body = await readJsonBody(req)
      const email = normalizeEmail(body.email)
      if (!email) throw new Error('Email is required.')
      await pb.collection('shop_users').requestPasswordReset(email)
      sendJson(res, 200, { data: { ok: true } }, headers)
      return
    }

    sendJson(res, 404, { message: 'Not found.' }, headers)
  } catch (error) {
    const status = Number(error?.status || error?.response?.status || 400)
    const message = String(error?.response?.message || error?.message || 'Admin API request failed.')
    sendJson(res, status >= 400 && status < 600 ? status : 500, { message }, headers)
  }
})

server.listen(PORT, () => {
  console.log(`Admin API listening on http://127.0.0.1:${PORT}`)
  console.log(`Allowed admin origins: ${ALLOWED_ORIGINS.join(', ') || 'none'}`)
})

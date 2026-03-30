import dotenv from 'dotenv'
import express from 'express'
import { fileURLToPath } from 'node:url'

import crypto from 'node:crypto'
import { createAdminToken, getAdminCredentials, hasConfiguredAdminCredentials, normalizeShopId, sha256hex, verifyAdminToken } from './backend/common.mjs'
import { authShop, getSyncRuntimeConfig, listShops, syncAction, upsertShop } from './backend/storage.mjs'

dotenv.config({ override: true })

const DEFAULT_PORT = Number(process.env.PORT || 8787)
const REQUEST_LIMIT = '50mb'

// Simple in-memory rate limiter for login endpoints
function createRateLimiter(windowMs = 15 * 60 * 1000, maxAttempts = 10) {
  const attempts = new Map()
  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown'
    const now = Date.now()
    const record = attempts.get(key)
    if (record && now - record.firstAttempt < windowMs) {
      if (record.count >= maxAttempts) {
        res.status(429).json({ ok: false, error: 'Too many login attempts. Try again later.' })
        return
      }
      record.count++
    } else {
      attempts.set(key, { firstAttempt: now, count: 1 })
    }
    // Cleanup old entries periodically
    if (attempts.size > 1000) {
      for (const [k, v] of attempts) {
        if (now - v.firstAttempt > windowMs) attempts.delete(k)
      }
    }
    next()
  }
}

export function createProxyApp() {
  const app = express()
  const loginLimiter = createRateLimiter(15 * 60 * 1000, 10)

  app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()')
    next()
  })
  app.use(express.json({ limit: REQUEST_LIMIT }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.get('/api/sync/config', (_req, res) => {
    res.json(getSyncRuntimeConfig())
  })

  app.get('/api/registry/config', (_req, res) => {
    res.json({
      ok: true,
      storageMode: 'apps-script',
      hasRegistryUrl: Boolean(process.env.PHONEDUKAAN_REGISTRY_APPS_SCRIPT_URL),
      registryUrl: '',
      usesGoogleApi: false,
    })
  })

  app.post('/api/auth/shop-login', loginLimiter, async (req, res) => {
    try {
      const loginId = String(req.body?.loginId || '').trim()
      const password = String(req.body?.password || '').trim()
      if (!loginId || !password) {
        res.status(400).json({ ok: false, error: 'Login ID and password are required.' })
        return
      }

      const data = await authShop({ loginId, passwordHash: sha256hex(password) })
      res.json(data)
    } catch (error) {
      res.status(401).json({ ok: false, error: error instanceof Error ? error.message : 'Shop login failed.' })
    }
  })

  app.post('/api/auth/admin-login', loginLimiter, (req, res) => {
    if (!hasConfiguredAdminCredentials()) {
      res.status(503).json({ ok: false, error: 'Admin login is not configured on the server.' })
      return
    }
    const { id, password } = getAdminCredentials()
    const inputId = String(req.body?.loginId || '').trim()
    const inputPassword = String(req.body?.password || '').trim()
    // Use timing-safe comparison to prevent timing attacks
    const idMatch = inputId.length === id.length && crypto.timingSafeEqual(Buffer.from(inputId), Buffer.from(id))
    const pwMatch = inputPassword.length === password.length && crypto.timingSafeEqual(Buffer.from(inputPassword), Buffer.from(password))
    if (idMatch && pwMatch) {
      res.json({ ok: true, token: createAdminToken() })
      return
    }
    res.status(401).json({ ok: false, error: 'Invalid admin credentials.' })
  })

  const requireAdmin = (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (!token || !verifyAdminToken(token)) {
      res.status(401).json({ ok: false, error: 'Admin login required.' })
      return
    }
    next()
  }

  app.get('/api/admin/shops', requireAdmin, async (_req, res) => {
    try {
      res.json(await listShops())
    } catch (error) {
      res.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to load shops.' })
    }
  })

  app.post('/api/admin/shops', requireAdmin, async (req, res) => {
    try {
      const payload = req.body || {}
      const loginId = String(payload.loginId || '').trim()
      const password = String(payload.password || '').trim()
      const shopId = normalizeShopId(payload.shopId)
      if (!loginId || !password || !shopId) {
        res.status(400).json({ ok: false, error: 'Shop ID, login ID, and password are required.' })
        return
      }
      const data = await upsertShop({
        shopId,
        shopName: String(payload.shopName || '').trim(),
        loginId,
        passwordHash: sha256hex(password),
        scriptUrl: String(payload.scriptUrl || '').trim(),
        syncKey: String(payload.syncKey || '').trim(),
      })

      res.json(data)
    } catch (error) {
      res.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to save shop config.' })
    }
  })

  app.post('/api/sync', async (req, res) => {
    try {
      res.json(await syncAction(req.body || {}))
    } catch (error) {
      res.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'Proxy request failed.' })
    }
  })

  return app
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createProxyApp()
  app.listen(DEFAULT_PORT, '0.0.0.0', () => {
    console.log(`Phone Dukaan sync proxy listening on http://0.0.0.0:${DEFAULT_PORT}`)
  })
}

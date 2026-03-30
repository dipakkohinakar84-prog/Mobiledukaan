import dotenv from 'dotenv'
import express from 'express'
import { fileURLToPath } from 'node:url'

import crypto from 'node:crypto'
import { createAdminToken, createDriveOAuthStateToken, getAdminCredentials, normalizeShopId, readDriveOAuthStateToken, readShopStorageToken, sha256hex, verifyAdminToken } from './backend/common.mjs'
import { authShop, disconnectDriveOAuth, exchangeDriveOAuthCode, getDriveOAuthStartUrl, getDriveOAuthStatus, getGoogleProfileEmail, getPhotoPreviewStream, getSyncRuntimeConfig, listShops, syncAction, storeDriveOAuthTokens, upsertShop } from './backend/storage.mjs'

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
      storageMode: 'google-api',
      hasRegistryUrl: false,
      registryUrl: '',
      usesGoogleApi: true,
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
        syncKey: String(payload.syncKey || '').trim(),
        serviceAccountEmail: String(payload.serviceAccountEmail || '').trim(),
        privateKey: String(payload.privateKey || ''),
        spreadsheetId: String(payload.spreadsheetId || '').trim(),
        driveFolderId: String(payload.driveFolderId || '').trim(),
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

  app.get('/api/photo', async (req, res) => {
    try {
      const fileId = String(req.query.fileId || '').trim()
      const shopId = normalizeShopId(req.query.shopId)
      const storageToken = String(req.query.storageToken || '').trim()
      const photo = await getPhotoPreviewStream({ storageToken, fileId, shopId })
      res.setHeader('Content-Type', photo.contentType)
      res.setHeader('Cache-Control', 'private, max-age=300')
      res.send(photo.buffer)
    } catch (error) {
      res.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to load photo.' })
    }
  })

  app.post('/api/drive-oauth/start', async (req, res) => {
    try {
      const storageToken = String(req.body?.storageToken || '').trim()
      const shopId = normalizeShopId(req.body?.shopId)
      if (!storageToken || !shopId) {
        res.status(400).json({ ok: false, error: 'Shop login required.' })
        return
      }
      const tokenData = readShopStorageToken(storageToken)
      if (tokenData?.shopId && normalizeShopId(tokenData.shopId) !== shopId) {
        res.status(403).json({ ok: false, error: 'Shop token mismatch.' })
        return
      }
      const state = createDriveOAuthStateToken({
        shopId,
        returnTo: String(req.body?.returnTo || '/').trim() || '/',
      })
      res.json({ ok: true, url: getDriveOAuthStartUrl({ state }) })
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to start Drive connection.' })
    }
  })

  app.get('/api/drive-oauth/callback', async (req, res) => {
    const fail = (message, returnTo = '/') => {
      const target = new URL(returnTo || '/', `${req.protocol}://${req.get('host')}`)
      target.searchParams.set('drive_oauth', 'error')
      target.searchParams.set('message', message)
      res.redirect(target.toString())
    }
    try {
      const code = String(req.query.code || '').trim()
      const state = String(req.query.state || '').trim()
      if (!code || !state) {
        fail('Missing Google OAuth response.')
        return
      }
      const parsedState = readDriveOAuthStateToken(state)
      const tokenData = await exchangeDriveOAuthCode({ code })
      const email = await getGoogleProfileEmail(tokenData.access_token)
      await storeDriveOAuthTokens({
        shopId: parsedState.shopId,
        refreshToken: tokenData.refresh_token || '',
        email,
      })
      const target = new URL(parsedState.returnTo || '/', `${req.protocol}://${req.get('host')}`)
      target.searchParams.set('drive_oauth', 'success')
      target.searchParams.set('email', email)
      res.redirect(target.toString())
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Google Drive connection failed.')
    }
  })

  app.post('/api/drive-oauth/status', async (req, res) => {
    try {
      const storageToken = String(req.body?.storageToken || '').trim()
      const shopId = normalizeShopId(req.body?.shopId)
      if (!storageToken || !shopId) {
        res.status(400).json({ ok: false, error: 'Shop login required.' })
        return
      }
      const tokenData = readShopStorageToken(storageToken)
      if (tokenData?.shopId && normalizeShopId(tokenData.shopId) !== shopId) {
        res.status(403).json({ ok: false, error: 'Shop token mismatch.' })
        return
      }
      res.json(await getDriveOAuthStatus({ shopId }))
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to load Drive status.' })
    }
  })

  app.post('/api/drive-oauth/disconnect', async (req, res) => {
    try {
      const storageToken = String(req.body?.storageToken || '').trim()
      const shopId = normalizeShopId(req.body?.shopId)
      if (!storageToken || !shopId) {
        res.status(400).json({ ok: false, error: 'Shop login required.' })
        return
      }
      const tokenData = readShopStorageToken(storageToken)
      if (tokenData?.shopId && normalizeShopId(tokenData.shopId) !== shopId) {
        res.status(403).json({ ok: false, error: 'Shop token mismatch.' })
        return
      }
      res.json(await disconnectDriveOAuth({ shopId }))
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to disconnect Drive.' })
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

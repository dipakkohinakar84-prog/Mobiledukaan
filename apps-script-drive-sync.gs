const FOLDER_NAME = 'MobileDukaanSync'
const DEFAULT_SHOP_ID = 'main-shop'
const SYNC_SECRET = ''
const ADMIN_SECRET = 'your-admin-secret'
const REGISTRY_FILE = 'phonedukaan-shops.json'

function doGet(e) {
  return handleRequest_(e.parameter || {}, null)
}

function doPost(e) {
  let body = {}
  try {
    body = JSON.parse((e.postData && e.postData.contents) || '{}')
  } catch (err) {
    return json_({ ok: false, error: 'Invalid JSON body' })
  }
  return handleRequest_(body, body.payload || null)
}

function handleRequest_(params, payload) {
  const action = String(params.action || 'status')
  const shopId = sanitizeShopId_(params.shopId || DEFAULT_SHOP_ID)
  const syncKey = String(params.syncKey || '')

  if (action === 'authShop') {
    const registry = readShopRegistry_()
    const loginId = String(payload && payload.loginId || '').trim().toLowerCase()
    const passwordHash = String(payload && payload.passwordHash || '').trim()
    const shop = registry.find(function(entry) {
      return String(entry.loginId || '').trim().toLowerCase() === loginId && String(entry.passwordHash || '').trim() === passwordHash
    })
    if (!shop) return json_({ ok: false, error: 'Invalid shop ID or password' })
    return json_({ ok: true, shop: { shopId: shop.shopId, shopName: shop.shopName || shop.shopId, scriptUrl: shop.scriptUrl || '', syncKey: shop.syncKey || '' } })
  }

  if (action === 'listShops') {
    if (String(payload && payload.adminSecret || '') !== ADMIN_SECRET) return json_({ ok: false, error: 'Invalid admin secret' })
    return json_({ ok: true, shops: readShopRegistry_().map(function(shop) {
      return { shopId: shop.shopId, shopName: shop.shopName || shop.shopId, loginId: shop.loginId, scriptUrl: shop.scriptUrl || '', syncKey: shop.syncKey ? 'Configured' : '', updatedAt: shop.updatedAt || '' }
    }) })
  }

  if (action === 'upsertShop') {
    if (String(payload && payload.adminSecret || '') !== ADMIN_SECRET) return json_({ ok: false, error: 'Invalid admin secret' })
    const registry = readShopRegistry_()
    const shop = payload && payload.shop || {}
    if (!shop.shopId || !shop.loginId || !shop.passwordHash || !shop.scriptUrl) return json_({ ok: false, error: 'shopId, loginId, passwordHash, and scriptUrl are required' })
    const normalized = { shopId: sanitizeShopId_(shop.shopId), shopName: String(shop.shopName || shop.shopId), loginId: String(shop.loginId || '').trim(), passwordHash: String(shop.passwordHash || '').trim(), scriptUrl: String(shop.scriptUrl || '').trim(), syncKey: String(shop.syncKey || '').trim(), updatedAt: new Date().toISOString() }
    const next = registry.filter(function(entry) { return String(entry.shopId) !== normalized.shopId })
    next.unshift(normalized)
    writeShopRegistry_(next)
    return json_({ ok: true, shop: { shopId: normalized.shopId, shopName: normalized.shopName, loginId: normalized.loginId } })
  }

  if (SYNC_SECRET && syncKey !== SYNC_SECRET) return json_({ ok: false, error: 'Invalid sync key' })

  const file = getShopFile_(shopId)
  if (action === 'status') {
    const existing = readPayload_(file)
    return json_({ ok: true, shopId: shopId, hasData: !!existing, hasShop: !!(existing && existing.shop), savedAt: existing && existing.savedAt ? existing.savedAt : '' })
  }
  if (action === 'pull') {
    const existing = readPayload_(file) || emptyPayload_()
    return json_({ ok: true, shopId: shopId, savedAt: existing.savedAt || '', data: existing })
  }
  if (action === 'push') {
    if (!payload || !Array.isArray(payload.inv) || !Array.isArray(payload.tx)) return json_({ ok: false, error: 'Payload must include inv and tx arrays' })
    const nextPayload = { version: Number(payload.version || 3), savedAt: new Date().toISOString(), inv: payload.inv, tx: payload.tx, shop: payload.shop && typeof payload.shop === 'object' ? payload.shop : {} }
    file.setContent(JSON.stringify(nextPayload))
    return json_({ ok: true, shopId: shopId, savedAt: nextPayload.savedAt })
  }
  if (action === 'uploadPhoto') {
    if (!payload || !payload.photoId || !payload.dataUrl) return json_({ ok: false, error: 'Photo payload must include photoId and dataUrl' })
    const photosFolder = getShopPhotosFolder_(shopId)
    const fileName = payload.fileName || (payload.photoId + '.jpg')
    const mimeType = String(payload.mimeType || 'image/jpeg')
    const dataUrl = String(payload.dataUrl || '')
    const base64 = dataUrl.indexOf(',') >= 0 ? dataUrl.split(',')[1] : dataUrl
    const bytes = Utilities.base64Decode(base64)
    const blob = Utilities.newBlob(bytes, mimeType, fileName)
    const file = photosFolder.createFile(blob)
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW) } catch (err) {}
    return json_({ ok: true, shopId: shopId, photo: { photoId: payload.photoId, fileId: file.getId(), fileName: file.getName(), mimeType: mimeType, size: blob.getBytes().length, uploadedAt: new Date().toISOString(), fileUrl: buildFileUrl_(file.getId()), openUrl: file.getUrl() } })
  }
  if (action === 'downloadPhoto') {
    if (!payload || !payload.fileId) return json_({ ok: false, error: 'Photo payload must include fileId' })
    const photoFile = DriveApp.getFileById(String(payload.fileId))
    const blob = photoFile.getBlob()
    return json_({ ok: true, shopId: shopId, photo: { fileId: payload.fileId, fileName: photoFile.getName(), mimeType: blob.getContentType(), size: blob.getBytes().length, dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()), fileUrl: buildFileUrl_(payload.fileId) } })
  }
  return json_({ ok: false, error: 'Unknown action' })
}

function emptyPayload_() { return { version: 3, savedAt: '', inv: [], tx: [], shop: {} } }

function getSyncFolder_() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME)
  if (folders.hasNext()) return folders.next()
  return DriveApp.createFolder(FOLDER_NAME)
}

function getShopFile_(shopId) {
  const folder = getSyncFolder_()
  const name = sanitizeShopId_(shopId) + '.json'
  const files = folder.getFilesByName(name)
  if (files.hasNext()) return files.next()
  return folder.createFile(name, JSON.stringify(emptyPayload_()), MimeType.PLAIN_TEXT)
}

function getRegistryFile_() {
  const root = getSyncFolder_()
  const files = root.getFilesByName(REGISTRY_FILE)
  if (files.hasNext()) return files.next()
  return root.createFile(REGISTRY_FILE, JSON.stringify([]), MimeType.PLAIN_TEXT)
}

function readShopRegistry_() {
  try {
    const raw = getRegistryFile_().getBlob().getDataAsString()
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    return []
  }
}

function writeShopRegistry_(registry) {
  getRegistryFile_().setContent(JSON.stringify(registry || []))
}

function getShopPhotosFolder_(shopId) {
  const root = getSyncFolder_()
  const folderName = sanitizeShopId_(shopId) + '-photos'
  const folders = root.getFoldersByName(folderName)
  if (folders.hasNext()) return folders.next()
  return root.createFolder(folderName)
}

function readPayload_(file) {
  try {
    const raw = file.getBlob().getDataAsString()
    return raw ? JSON.parse(raw) : null
  } catch (err) {
    return null
  }
}

function buildFileUrl_(fileId) {
  return 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(String(fileId || ''))
}

function sanitizeShopId_(value) {
  const clean = String(value || DEFAULT_SHOP_ID).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64)
  return clean || DEFAULT_SHOP_ID
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)
}

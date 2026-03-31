import PocketBase, { BaseAuthStore } from 'pocketbase'

const pbUrl = String(
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_POCKETBASE_URL)
  || (typeof process !== 'undefined' && process.env && process.env.VITE_POCKETBASE_URL)
  || ''
).trim()

const COLLECTIONS = {
  shops: 'shops',
  shopUsers: 'shop_users',
  sync: 'shop_sync',
  photos: 'shop_photos',
}

function ensureUrl() {
  if (!pbUrl) throw new Error('VITE_POCKETBASE_URL is not configured.')
  return pbUrl
}

function createClient(auth) {
  const pb = new PocketBase(ensureUrl())
  pb.autoCancellation(false)
  pb.authStore = new BaseAuthStore()
  if (auth?.token && auth?.record) {
    pb.authStore.save(auth.token, auth.record)
  }
  return pb
}

function buildShopUserEmail(loginId, shopId) {
  const safe = String(shopId || loginId || 'shop').toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'shop'
  return `${safe}@users.phonedukaan.local`
}

async function getFirstOrNull(service, filter) {
  try {
    return await service.getFirstListItem(filter)
  } catch (error) {
    if (error?.status === 404) return null
    throw error
  }
}

export function getPocketBaseUrl() {
  return ensureUrl()
}

export async function pocketbaseAdminLogin(loginId, password) {
  const pb = createClient()
  const auth = await pb.admins.authWithPassword(String(loginId || '').trim(), String(password || '').trim())
  return {
    token: auth.token,
    record: auth.record,
  }
}

export async function pocketbaseListShops(adminAuth) {
  const pb = createClient(adminAuth)
  const [shops, users] = await Promise.all([
    pb.collection(COLLECTIONS.shops).getFullList({ sort: '-created' }),
    pb.collection(COLLECTIONS.shopUsers).getFullList({ sort: '-created' }),
  ])
  const usersByShop = new Map()
  users.forEach((user) => {
    if (!user.shop) return
    usersByShop.set(String(user.shop), user)
  })
  return shops.map((shop) => {
    const user = usersByShop.get(String(shop.id))
    return {
      shopId: shop.shopId || shop.id,
      shopName: shop.name || shop.shopName || shop.shopId || shop.id,
      loginId: user?.username || '',
      scriptUrl: 'PocketBase',
      syncKey: 'Managed',
      updatedAt: shop.updated || shop.created || '',
    }
  })
}

export async function pocketbaseSaveShop(adminAuth, form) {
  const pb = createClient(adminAuth)
  const normalizedShopId = String(form.shopId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-')
  const loginId = String(form.loginId || '').trim()
  const password = String(form.password || '').trim()
  if (!normalizedShopId || !loginId || !password) throw new Error('Shop ID, login ID, and password are required.')

  let shop = await getFirstOrNull(pb.collection(COLLECTIONS.shops), `shopId="${normalizedShopId.replace(/"/g, '\\"')}"`)
  const shopPayload = {
    shopId: normalizedShopId,
    name: String(form.shopName || normalizedShopId).trim() || normalizedShopId,
  }
  shop = shop
    ? await pb.collection(COLLECTIONS.shops).update(shop.id, shopPayload)
    : await pb.collection(COLLECTIONS.shops).create(shopPayload)

  let user = await getFirstOrNull(pb.collection(COLLECTIONS.shopUsers), `username="${loginId.replace(/"/g, '\\"')}"`)
  const userPayload = {
    username: loginId,
    email: buildShopUserEmail(loginId, normalizedShopId),
    emailVisibility: false,
    password,
    passwordConfirm: password,
    shop: shop.id,
    active: true,
  }
  user = user
    ? await pb.collection(COLLECTIONS.shopUsers).update(user.id, userPayload)
    : await pb.collection(COLLECTIONS.shopUsers).create(userPayload)

  let sync = await getFirstOrNull(pb.collection(COLLECTIONS.sync), `shop="${shop.id}"`)
  if (!sync) {
    await pb.collection(COLLECTIONS.sync).create({ shop: shop.id, shopId: normalizedShopId, shopName: shop.name, payload: {}, savedAt: '' })
  }

  return { ok: true, shop: { shopId: normalizedShopId, shopName: shop.name, loginId: user.username } }
}

export async function pocketbaseShopLogin(loginId, password) {
  const pb = createClient()
  const auth = await pb.collection(COLLECTIONS.shopUsers).authWithPassword(String(loginId || '').trim(), String(password || '').trim())
  const shop = auth.record?.shop ? await pb.collection(COLLECTIONS.shops).getOne(auth.record.shop) : null
  if (!shop) throw new Error('Shop is not linked in PocketBase.')
  return {
    token: auth.token,
    record: auth.record,
    shop: {
      id: shop.id,
      shopId: shop.shopId || shop.id,
      shopName: shop.name || shop.shopId || shop.id,
      scriptUrl: ensureUrl(),
      syncKey: '',
    },
  }
}

async function getShopSyncRecord(pb, shopRecordId) {
  return getFirstOrNull(pb.collection(COLLECTIONS.sync), `shop="${String(shopRecordId)}"`)
}

export async function pocketbaseSyncAction(shopAuth, action, payload = null) {
  const pb = createClient(shopAuth)
  const shopRecordId = shopAuth?.record?.shop
  if (!shopRecordId) throw new Error('PocketBase shop session is missing shop relation.')
  const shop = await pb.collection(COLLECTIONS.shops).getOne(shopRecordId)

  if (action === 'status') {
    const record = await getShopSyncRecord(pb, shopRecordId)
    const stored = record?.payload || {}
    return { ok: true, shopId: shop.shopId || shop.id, hasData: Boolean(record && (stored.inv?.length || stored.tx?.length || stored.shop)), hasShop: Boolean(stored.shop), savedAt: record?.savedAt || '' }
  }

  if (action === 'pull') {
    const record = await getShopSyncRecord(pb, shopRecordId)
    const stored = record?.payload || { version: 3, savedAt: '', inv: [], tx: [], shop: {} }
    return { ok: true, shopId: shop.shopId || shop.id, savedAt: record?.savedAt || stored.savedAt || '', data: stored }
  }

  if (action === 'push') {
    if (!payload || !Array.isArray(payload.inv) || !Array.isArray(payload.tx)) throw new Error('Payload must include inv and tx arrays.')
    const savedAt = new Date().toISOString()
    const syncPayload = {
      version: Number(payload.version || 3),
      savedAt,
      inv: payload.inv,
      tx: payload.tx,
      shop: payload.shop && typeof payload.shop === 'object' ? payload.shop : {},
    }
    const record = await getShopSyncRecord(pb, shopRecordId)
    const body = { shop: shopRecordId, shopId: shop.shopId || shop.id, shopName: shop.name || shop.shopId || shop.id, payload: syncPayload, savedAt }
    if (record) await pb.collection(COLLECTIONS.sync).update(record.id, body)
    else await pb.collection(COLLECTIONS.sync).create(body)
    return { ok: true, shopId: shop.shopId || shop.id, savedAt }
  }

  if (action === 'uploadPhoto') {
    if (!payload?.photoId || !payload?.dataUrl) throw new Error('Photo payload must include photoId and dataUrl.')
    const file = await dataUrlToFile(payload.dataUrl, payload.fileName || `${payload.photoId}.jpg`, payload.mimeType || 'image/jpeg')
    let record = await getFirstOrNull(pb.collection(COLLECTIONS.photos), `shop="${shopRecordId}" && photoId="${String(payload.photoId).replace(/"/g, '\\"')}"`)
    const form = new FormData()
    form.append('shop', shopRecordId)
    form.append('photoId', String(payload.photoId))
    form.append('itemId', String(payload.itemId || ''))
    form.append('uploadedAt', new Date().toISOString())
    form.append('file', file)
    record = record
      ? await pb.collection(COLLECTIONS.photos).update(record.id, form)
      : await pb.collection(COLLECTIONS.photos).create(form)
    const fileField = Array.isArray(record.file) ? record.file[0] : record.file
    const fileUrl = pb.files.getURL(record, fileField)
    return { ok: true, shopId: shop.shopId || shop.id, photo: { photoId: payload.photoId, fileId: record.id, fileName: payload.fileName || file.name, mimeType: payload.mimeType || file.type || 'image/jpeg', size: file.size, uploadedAt: record.uploadedAt || new Date().toISOString(), fileUrl } }
  }

  throw new Error(`Unsupported sync action: ${action}`)
}

async function dataUrlToFile(dataUrl, fileName, mimeType) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const contentType = mimeType || blob.type || 'application/octet-stream'
  return new File([blob], fileName, { type: contentType })
}

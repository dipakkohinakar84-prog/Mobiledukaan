import PocketBase, { BaseAuthStore } from 'pocketbase'

const pbUrl = String(
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_POCKETBASE_URL)
  || (typeof process !== 'undefined' && process.env && process.env.VITE_POCKETBASE_URL)
  || ''
).trim()

const adminApiUrl = String(
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ADMIN_API_URL)
  || (typeof process !== 'undefined' && process.env && process.env.VITE_ADMIN_API_URL)
  || ''
).trim()

const COLLECTIONS = {
  shops: 'shops',
  shopUsers: 'shop_users',
  appSettings: 'app_settings',
  inventory: 'inventory',
  transactions: 'transactions',
  photos: 'photos',
  repairs: 'repairs',
}

const DEFAULT_ENABLED_MODULES = ['buy', 'sell', 'repair']

const DEFAULT_TRIAL_DAYS = 7
const ADMIN_API_BASE = adminApiUrl ? `${adminApiUrl.replace(/\/$/, '')}/admin-api` : '/admin-api'

function ensureUrl() {
  if (!pbUrl) throw new Error('VITE_POCKETBASE_URL is not configured.')
  return pbUrl
}

function createClient(auth) {
  const pb = new PocketBase(ensureUrl())
  pb.autoCancellation(false)
  pb.authStore = new BaseAuthStore()
  if (auth?.token && auth?.record) pb.authStore.save(auth.token, auth.record)
  return pb
}

async function adminApiRequest(path, { method = 'GET', body, adminAuth } = {}) {
  const response = await fetch(`${ADMIN_API_BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(adminAuth?.sessionToken ? { Authorization: `Bearer ${adminAuth.sessionToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.message || 'Admin request failed.')
  return payload?.data ?? payload
}

function buildShopUserEmail(loginId, shopId) {
  const safe = String(shopId || loginId || 'shop').toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'shop'
  return `${safe}@users.phonedukaan.local`
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

function buildShopSlug(shopName = '', mobileNumber = '') {
  const base = String(shopName || mobileNumber || 'shop')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return normalizeShopId(base || `shop-${normalizeMobileNumber(mobileNumber) || Date.now()}`)
}

function computeTrialEndsAt(trialDays = DEFAULT_TRIAL_DAYS) {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + Math.max(1, Number(trialDays || DEFAULT_TRIAL_DAYS)))
  return expiresAt.toISOString()
}

async function resolveTrialDays(pb) {
  try {
    const result = await pb.collection(COLLECTIONS.appSettings).getList(1, 1, { sort: '-created' })
    const configuredValue = Number(result?.items?.[0]?.trialDays || 0)
    return configuredValue > 0 ? configuredValue : DEFAULT_TRIAL_DAYS
  } catch {
    return DEFAULT_TRIAL_DAYS
  }
}

function isTrialExpired(trialEndsAt) {
  if (!trialEndsAt) return false
  const expiresAt = Date.parse(String(trialEndsAt))
  return Number.isFinite(expiresAt) && expiresAt < Date.now()
}

function ensureTrialActive(record) {
  if (record?.active === false) {
    throw new Error('Your account is inactive. Contact support to continue.')
  }
  const trialEndsAt = String(record?.trialEndsAt || '')
  if (isTrialExpired(trialEndsAt)) {
    throw new Error('Your trial has expired. Contact support to extend access.')
  }
  return trialEndsAt
}

async function createUniqueShop(pb, shopPayload) {
  const baseShopId = normalizeShopId(shopPayload.shopId)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`
    try {
      return await pb.collection(COLLECTIONS.shops).create({
        ...shopPayload,
        shopId: `${baseShopId}${suffix}`,
      })
    } catch (error) {
      const message = String(error?.message || '')
      const duplicateShopId = message.toLowerCase().includes('shopid') || message.toLowerCase().includes('already exists')
      if (!duplicateShopId || attempt === 4) throw error
    }
  }
  throw new Error('Unable to create shop at the moment.')
}

function authRecordToShopSession(record, shop, token) {
  return {
    token,
    record,
    trialEndsAt: String(record?.trialEndsAt || ''),
    shop: {
      id: shop.id,
      shopId: shop.shopId || shop.id,
      shopName: shop.name || shop.shopId || shop.id,
    },
  }
}

function shopFilter(shopRecordId) {
  return `shop="${String(shopRecordId).replace(/"/g, '\\"')}"`
}

function pbPhotoToRef(pb, record) {
  const fileField = Array.isArray(record.file) ? record.file[0] : record.file
  return {
    id: record.photoId || record.id,
    fileId: record.id,
    fileName: fileField || '',
    mimeType: inferMimeType(fileField),
    size: 0,
    uploadedAt: record.uploadedAt || record.created || '',
    fileUrl: fileField ? pb.files.getURL(record, fileField) : '',
    syncStatus: fileField ? 'synced' : 'local-only',
  }
}

function parseEnabledModulesCsv(value = '') {
  const modules = String(value || '')
    .split(',')
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
  return Array.from(new Set(modules)).length ? Array.from(new Set(modules)) : DEFAULT_ENABLED_MODULES
}

function repairFileToRef(pb, record, fileName) {
  return {
    id: `${record.id}:${fileName}`,
    fileId: fileName,
    fileName,
    mimeType: inferMimeType(fileName),
    size: 0,
    uploadedAt: record.updated || record.created || '',
    fileUrl: pb.files.getURL(record, fileName),
    syncStatus: fileName ? 'synced' : 'local-only',
  }
}

export function getPocketBaseUrl() {
  return ensureUrl()
}

export async function pocketbaseGetTrialDays() {
  const pb = createClient()
  return resolveTrialDays(pb)
}

export async function pocketbaseAdminLogin(loginId, password) {
  return adminApiRequest('/login', {
    method: 'POST',
    body: { loginId: String(loginId || '').trim(), password: String(password || '').trim() },
  })
}

export async function pocketbaseAdminSession(adminAuth) {
  return adminApiRequest('/session', { adminAuth })
}

export async function pocketbaseAdminLogout(adminAuth) {
  return adminApiRequest('/logout', { method: 'POST', adminAuth })
}

export async function pocketbaseListShops(adminAuth) {
  const dashboard = await pocketbaseAdminLoadDashboard(adminAuth)
  return dashboard?.shops || []
}

export async function pocketbaseAdminLoadDashboard(adminAuth) {
  return adminApiRequest('/dashboard', { adminAuth })
}

export async function pocketbaseAdminUpdateUser(adminAuth, userId, patch) {
  return adminApiRequest(`/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    adminAuth,
    body: patch,
  })
}

export async function pocketbaseAdminExtendUserTrial(adminAuth, userId, days) {
  return adminApiRequest(`/users/${encodeURIComponent(userId)}/extend-trial`, {
    method: 'POST',
    adminAuth,
    body: { days },
  })
}

export async function pocketbaseAdminUpdateShop(adminAuth, shopId, patch) {
  return adminApiRequest(`/shops/${encodeURIComponent(shopId)}`, {
    method: 'PATCH',
    adminAuth,
    body: patch,
  })
}

export async function pocketbaseAdminUpdateSettings(adminAuth, patch) {
  return adminApiRequest('/settings', {
    method: 'PUT',
    adminAuth,
    body: patch,
  })
}

export async function pocketbaseAdminSendPasswordReset(adminAuth, email) {
  return adminApiRequest('/password-reset', {
    method: 'POST',
    adminAuth,
    body: { email },
  })
}

export async function pocketbaseSaveShop(adminAuth, form) {
  return adminApiRequest('/shops', {
    method: 'POST',
    adminAuth,
    body: form,
  })
}

export async function pocketbaseShopLogin(loginId, password) {
  const pb = createClient()
  const normalizedLoginId = normalizeMobileNumber(loginId) || String(loginId || '').trim()
  const auth = await pb.collection(COLLECTIONS.shopUsers).authWithPassword(normalizedLoginId, String(password || '').trim())
  ensureTrialActive(auth.record)
  const shop = auth.record?.shop ? await pb.collection(COLLECTIONS.shops).getOne(auth.record.shop) : null
  if (!shop) throw new Error('Shop is not linked in PocketBase.')
  return authRecordToShopSession(auth.record, shop, auth.token)
}

export async function pocketbaseRegisterShopUser(form) {
  const pb = createClient()
  const shopName = String(form.shopName || '').trim()
  const mobileNumber = normalizeMobileNumber(form.mobileNumber)
  const email = normalizeEmail(form.email)
  const password = String(form.password || '').trim()
  const normalizedShopId = normalizeShopId(form.shopId) || buildShopSlug(shopName, mobileNumber)
  const trialDays = await resolveTrialDays(pb)
  const trialEndsAt = computeTrialEndsAt(trialDays)

  if (!shopName) throw new Error('Shop name is required.')
  if (mobileNumber.length !== 10) throw new Error('Enter a valid 10-digit mobile number.')
  if (!email) throw new Error('Email is required.')
  if (!password) throw new Error('Password is required.')

  const shop = await createUniqueShop(pb, {
    shopId: normalizedShopId,
    name: shopName,
    phone: mobileNumber,
    email,
  })

  try {
    const user = await pb.collection(COLLECTIONS.shopUsers).create({
      username: mobileNumber,
      email,
      emailVisibility: false,
      password,
      passwordConfirm: password,
      shop: shop.id,
      active: true,
      trialEndsAt,
    })

    const auth = await pb.collection(COLLECTIONS.shopUsers).authWithPassword(mobileNumber, password)
    return authRecordToShopSession(auth.record || user, shop, auth.token)
  } catch (error) {
    try { await pb.collection(COLLECTIONS.shops).delete(shop.id) } catch {}
    throw error
  }
}

export async function pocketbaseRequestPasswordReset(email) {
  const pb = createClient()
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) throw new Error('Email is required.')
  await pb.collection(COLLECTIONS.shopUsers).requestPasswordReset(normalizedEmail)
  return { ok: true }
}

export function pocketbaseIsTrialExpired(trialEndsAt) {
  return isTrialExpired(trialEndsAt)
}

export async function pocketbaseLoadShopBundle(shopAuth) {
  const pb = createClient(shopAuth)
  const shopRecordId = shopAuth?.record?.shop
  if (!shopRecordId) throw new Error('PocketBase shop session is missing shop relation.')

  const [shop, inventory, transactions, photos, repairs] = await Promise.all([
    pb.collection(COLLECTIONS.shops).getOne(shopRecordId),
    pb.collection(COLLECTIONS.inventory).getFullList({ filter: shopFilter(shopRecordId), sort: '-created' }),
    pb.collection(COLLECTIONS.transactions).getFullList({ filter: shopFilter(shopRecordId), sort: '-created' }),
    pb.collection(COLLECTIONS.photos).getFullList({ filter: shopFilter(shopRecordId), sort: '-created' }),
    pb.collection(COLLECTIONS.repairs).getFullList({ filter: shopFilter(shopRecordId), sort: '-created' }),
  ])

  const photosByItemId = new Map()
  photos.forEach((photo) => {
    const itemId = String(photo.inventoryItem || '')
    if (!itemId) return
    const list = photosByItemId.get(itemId) || []
    list.push(pbPhotoToRef(pb, photo))
    photosByItemId.set(itemId, list)
  })

  return {
    shop: await shopRecordToProfile(pb, shop),
    inv: inventory.map((record) => inventoryRecordToItem(pb, record, photosByItemId.get(String(record.id)) || [])),
    tx: transactions.map(transactionRecordToItem),
    repairs: repairs.map((record) => repairRecordToItem(pb, record)),
    savedAt: newestTimestamp([shop.updated, ...inventory.map(r => r.updated), ...transactions.map(r => r.updated), ...photos.map(r => r.updated), ...repairs.map(r => r.updated)]),
  }
}

export async function pocketbaseUpsertInventory(shopAuth, item) {
  const pb = createClient(shopAuth)
  const shopRecordId = shopAuth?.record?.shop
  if (!shopRecordId) throw new Error('PocketBase shop session is missing shop relation.')
  const payload = inventoryItemToRecord(item, shopRecordId)
  const hasSellerFiles = [item?.sellerIdPhotoData, item?.sellerPhotoData, item?.sellerSignatureData].some((value) => String(value || '').startsWith('data:'))
  if (hasSellerFiles) {
    const form = new FormData()
    Object.entries(payload).forEach(([key, value]) => form.append(key, value == null ? '' : String(value)))
    if (String(item?.sellerIdPhotoData || '').startsWith('data:')) form.append('sellerIdPhoto', await dataUrlToFile(item.sellerIdPhotoData, 'seller-id.jpg', inferMimeTypeFromDataUrl(item.sellerIdPhotoData)))
    if (String(item?.sellerPhotoData || '').startsWith('data:')) form.append('sellerPhoto', await dataUrlToFile(item.sellerPhotoData, 'seller-photo.jpg', inferMimeTypeFromDataUrl(item.sellerPhotoData)))
    if (String(item?.sellerSignatureData || '').startsWith('data:')) form.append('sellerSignature', await dataUrlToFile(item.sellerSignatureData, 'seller-signature.png', inferMimeTypeFromDataUrl(item.sellerSignatureData)))
    return isPocketbaseId(item?.id)
      ? pb.collection(COLLECTIONS.inventory).update(item.id, form)
      : pb.collection(COLLECTIONS.inventory).create(form)
  }
  return isPocketbaseId(item?.id)
    ? pb.collection(COLLECTIONS.inventory).update(item.id, payload)
    : pb.collection(COLLECTIONS.inventory).create(payload)
}

export async function pocketbaseDeleteInventory(shopAuth, itemId) {
  const pb = createClient(shopAuth)
  if (!isPocketbaseId(itemId)) return
  const photos = await pb.collection(COLLECTIONS.photos).getFullList({ filter: `inventoryItem="${String(itemId).replace(/"/g, '\\"')}"` })
  await Promise.all(photos.map((photo) => pb.collection(COLLECTIONS.photos).delete(photo.id)))
  await pb.collection(COLLECTIONS.inventory).delete(itemId)
}

export async function pocketbaseUpsertRepair(shopAuth, repair) {
  const pb = createClient(shopAuth)
  const shopRecordId = shopAuth?.record?.shop
  if (!shopRecordId) throw new Error('PocketBase shop session is missing shop relation.')
  const payload = repairItemToRecord(repair, shopRecordId)
  const localPhotos = (repair?.photos || []).filter((photo) => String(photo?.previewDataUrl || '').startsWith('data:'))
  if (!localPhotos.length) {
    return isPocketbaseId(repair?.id)
      ? pb.collection(COLLECTIONS.repairs).update(repair.id, payload)
      : pb.collection(COLLECTIONS.repairs).create(payload)
  }
  const form = new FormData()
  Object.entries(payload).forEach(([key, value]) => form.append(key, value == null ? '' : String(value)))
  for (const photo of localPhotos) {
    const file = await dataUrlToFile(photo.previewDataUrl, photo.fileName || `${repair.repairNo || repair.id || Date.now()}.jpg`, photo.mimeType || inferMimeTypeFromDataUrl(photo.previewDataUrl))
    form.append(isPocketbaseId(repair?.id) ? 'photos+' : 'photos', file)
  }
  return isPocketbaseId(repair?.id)
    ? pb.collection(COLLECTIONS.repairs).update(repair.id, form)
    : pb.collection(COLLECTIONS.repairs).create(form)
}

export async function pocketbaseDeleteRepair(shopAuth, repairId) {
  const pb = createClient(shopAuth)
  if (!isPocketbaseId(repairId)) return
  await pb.collection(COLLECTIONS.repairs).delete(repairId)
}

export async function pocketbaseCreateTransaction(shopAuth, tx) {
  const pb = createClient(shopAuth)
  const shopRecordId = shopAuth?.record?.shop
  if (!shopRecordId) throw new Error('PocketBase shop session is missing shop relation.')
  return pb.collection(COLLECTIONS.transactions).create(transactionItemToRecord(tx, shopRecordId))
}

export async function pocketbaseUpdateShopProfile(shopAuth, profile) {
  const pb = createClient(shopAuth)
  const shopRecordId = shopAuth?.record?.shop
  if (!shopRecordId) throw new Error('PocketBase shop session is missing shop relation.')
  const shop = await pb.collection(COLLECTIONS.shops).getOne(shopRecordId)
  const nextPayload = shopProfileToRecord(profile, shop)
  const logoData = String(profile.logoData || '')

  if (logoData.startsWith('data:')) {
    const form = new FormData()
    Object.entries(nextPayload).forEach(([key, value]) => {
      form.append(key, value == null ? '' : String(value))
    })
    form.append('logo', await dataUrlToFile(logoData, 'shop-logo.png', inferMimeTypeFromDataUrl(logoData)))
    return pb.collection(COLLECTIONS.shops).update(shopRecordId, form)
  }

  if (!logoData && shop.logo) {
    nextPayload.logo = null
  }

  return pb.collection(COLLECTIONS.shops).update(shopRecordId, nextPayload)
}

export async function pocketbaseUploadPhoto(shopAuth, itemId, photo) {
  const pb = createClient(shopAuth)
  const shopRecordId = shopAuth?.record?.shop
  if (!shopRecordId) throw new Error('PocketBase shop session is missing shop relation.')
  const file = await dataUrlToFile(photo.dataUrl, photo.fileName || `${photo.id}.jpg`, photo.mimeType || 'image/jpeg')
  const form = new FormData()
  form.append('shop', shopRecordId)
  form.append('photoId', String(photo.id || ''))
  form.append('inventoryItem', String(itemId || ''))
  form.append('uploadedAt', new Date().toISOString())
  form.append('file', file)
  const record = await pb.collection(COLLECTIONS.photos).create(form)
  return pbPhotoToRef(pb, record)
}

let realtimeClient = null
let realtimeUnsubscribers = []

export async function subscribeToShopData(shopAuth, onChange) {
  const pb = createClient(shopAuth)
  realtimeClient = pb
  const shopRecordId = shopAuth?.record?.shop
  if (!shopRecordId) return () => {}
  try {
    realtimeUnsubscribers = await Promise.all([
      pb.collection(COLLECTIONS.inventory).subscribe('*', () => onChange()),
      pb.collection(COLLECTIONS.transactions).subscribe('*', () => onChange()),
      pb.collection(COLLECTIONS.photos).subscribe('*', () => onChange()),
      pb.collection(COLLECTIONS.repairs).subscribe('*', () => onChange()),
      pb.collection(COLLECTIONS.shops).subscribe(shopRecordId, () => onChange()),
    ])
  } catch (err) {
    console.warn('PocketBase realtime subscribe failed:', err?.message)
    return () => {}
  }
  return () => unsubscribeFromShopData()
}

export function unsubscribeFromShopData() {
  realtimeUnsubscribers.forEach((fn) => {
    try { fn() } catch {}
  })
  realtimeUnsubscribers = []
  if (realtimeClient) {
    try { realtimeClient.realtime.disconnect() } catch {}
    realtimeClient = null
  }
}

function inventoryRecordToItem(pb, record, photos) {
  const sellerIdPhotoField = Array.isArray(record.sellerIdPhoto) ? record.sellerIdPhoto[0] : record.sellerIdPhoto
  const sellerPhotoField = Array.isArray(record.sellerPhoto) ? record.sellerPhoto[0] : record.sellerPhoto
  const sellerSignatureField = Array.isArray(record.sellerSignature) ? record.sellerSignature[0] : record.sellerSignature
  return {
    id: record.id,
    imei: record.imei || '',
    imei2: record.imei2 || '',
    brand: record.brand || 'Samsung',
    model: record.model || '',
    color: record.color || '',
    ram: record.ram || '',
    storage: record.storage || '',
    batteryHealth: record.batteryHealth || '',
    condition: record.condition || 'New',
    buyPrice: Number(record.buyPrice || 0),
    sellPrice: Number(record.sellPrice || 0),
    status: record.status || 'In Stock',
    deletedAt: record.deletedAt || '',
    qty: Number(record.qty || 0),
    addedDate: record.addedDate || '',
    supplier: record.supplier || '',
    sellerName: record.sellerName || '',
    sellerPhone: record.sellerPhone || '',
    sellerAadhaarNumber: record.sellerAadhaarNumber || '',
    purchaseDate: record.purchaseDate || '',
    warrantyType: record.warrantyType || 'No Warranty',
    warrantyMonths: Number(record.warrantyMonths || 0),
    sellerAgreementAccepted: !!record.sellerAgreementAccepted,
    sellerIdPhotoData: sellerIdPhotoField ? pb.files.getURL(record, sellerIdPhotoField) : '',
    sellerPhotoData: sellerPhotoField ? pb.files.getURL(record, sellerPhotoField) : '',
    sellerSignatureData: sellerSignatureField ? pb.files.getURL(record, sellerSignatureField) : '',
    customerName: record.customerName || '',
    customerPhone: record.customerPhone || '',
    soldDate: record.soldDate || '',
    lastInvoiceNo: record.lastInvoiceNo || '',
    photos,
  }
}

function transactionRecordToItem(record) {
  return {
    id: record.id,
    type: record.type || 'Buy',
    stockItemId: record.inventoryItem || '',
    imei: record.imei || '',
    imei2: record.imei2 || '',
    brand: record.brand || '',
    model: record.model || '',
    color: record.color || '',
    ram: record.ram || '',
    storage: record.storage || '',
    batteryHealth: record.batteryHealth || '',
    condition: record.condition || '',
    customerName: record.customerName || '',
    phone: record.phone || '',
    amount: Number(record.amount || 0),
    paidAmount: Number(record.paidAmount || 0),
    dueAmount: Number(record.dueAmount || 0),
    costPrice: Number(record.costPrice || 0),
    paymentMode: record.paymentMode || 'Cash',
    invoiceNo: record.invoiceNo || '',
    billType: record.billType || 'NON GST',
    gstRate: Number(record.gstRate || 0),
    taxableAmount: Number(record.taxableAmount || 0),
    gstAmount: Number(record.gstAmount || 0),
    cgstAmount: Number(record.cgstAmount || 0),
    sgstAmount: Number(record.sgstAmount || 0),
    totalAmount: Number(record.totalAmount || 0),
    date: record.date || '',
    dateTime: record.dateTime || '',
    notes: record.notes || '',
    sellerName: record.sellerName || '',
    sellerPhone: record.sellerPhone || '',
    sellerAadhaarNumber: record.sellerAadhaarNumber || '',
    purchaseDate: record.purchaseDate || '',
    shopSnapshot: null,
  }
}

function repairRecordToItem(pb, record) {
  const photoList = Array.isArray(record.photos) ? record.photos : (record.photos ? [record.photos] : [])
  return {
    id: record.id,
    repairNo: record.repairNo || '',
    customerName: record.customerName || '',
    phone: record.phone || '',
    brand: record.brand || '',
    model: record.model || '',
    color: record.color || '',
    imei: record.imei || '',
    problem: record.problem || '',
    estimatedCost: Number(record.estimatedCost || 0),
    advance: Number(record.advance || 0),
    finalCost: Number(record.finalCost || 0),
    status: record.status || 'Received',
    receivedDate: record.receivedDate || '',
    deliveredDate: record.deliveredDate || '',
    notes: record.notes || '',
    photos: photoList.map((fileName) => repairFileToRef(pb, record, fileName)),
    createdAt: record.created || '',
    updatedAt: record.updated || '',
  }
}

function inventoryItemToRecord(item, shopRecordId) {
  return {
    shop: shopRecordId,
    imei: item.imei || '',
    imei2: item.imei2 || '',
    brand: item.brand || '',
    model: item.model || '',
    color: item.color || '',
    ram: item.ram || '',
    storage: item.storage || '',
    batteryHealth: item.batteryHealth || '',
    condition: item.condition || 'New',
    buyPrice: Number(item.buyPrice || 0),
    sellPrice: Number(item.sellPrice || 0),
    status: item.status || 'In Stock',
    deletedAt: item.deletedAt || '',
    qty: Number(item.qty || 0),
    supplier: item.supplier || '',
    sellerName: item.sellerName || '',
    sellerPhone: item.sellerPhone || '',
    sellerAadhaarNumber: item.sellerAadhaarNumber || '',
    purchaseDate: item.purchaseDate || '',
    warrantyType: item.warrantyType || 'No Warranty',
    warrantyMonths: Number(item.warrantyMonths || 0),
    sellerAgreementAccepted: !!item.sellerAgreementAccepted,
    addedDate: item.addedDate || '',
    customerName: item.customerName || '',
    customerPhone: item.customerPhone || '',
    soldDate: item.soldDate || '',
    lastInvoiceNo: item.lastInvoiceNo || '',
  }
}

function repairItemToRecord(item, shopRecordId) {
  return {
    shop: shopRecordId,
    repairNo: item.repairNo || '',
    customerName: item.customerName || '',
    phone: item.phone || '',
    brand: item.brand || '',
    model: item.model || '',
    color: item.color || '',
    imei: item.imei || '',
    problem: item.problem || '',
    estimatedCost: Number(item.estimatedCost || 0),
    advance: Number(item.advance || 0),
    finalCost: Number(item.finalCost || 0),
    status: item.status || 'Received',
    receivedDate: item.receivedDate || '',
    deliveredDate: item.deliveredDate || '',
    notes: item.notes || '',
  }
}

function transactionItemToRecord(item, shopRecordId) {
  return {
    shop: shopRecordId,
    inventoryItem: item.stockItemId || '',
    type: item.type || 'Buy',
    invoiceNo: item.invoiceNo || '',
    imei: item.imei || '',
    imei2: item.imei2 || '',
    brand: item.brand || '',
    model: item.model || '',
    color: item.color || '',
    ram: item.ram || '',
    storage: item.storage || '',
    batteryHealth: item.batteryHealth || '',
    condition: item.condition || '',
    customerName: item.customerName || '',
    phone: item.phone || '',
    amount: Number(item.amount || 0),
    paidAmount: Number(item.paidAmount || 0),
    dueAmount: Number(item.dueAmount || 0),
    costPrice: Number(item.costPrice || 0),
    paymentMode: item.paymentMode || 'Cash',
    billType: item.billType || 'NON GST',
    gstRate: Number(item.gstRate || 0),
    taxableAmount: Number(item.taxableAmount || 0),
    gstAmount: Number(item.gstAmount || 0),
    cgstAmount: Number(item.cgstAmount || 0),
    sgstAmount: Number(item.sgstAmount || 0),
    totalAmount: Number(item.totalAmount || 0),
    date: item.date || '',
    dateTime: item.dateTime || '',
    notes: item.notes || '',
    sellerName: item.sellerName || '',
    sellerPhone: item.sellerPhone || '',
    sellerAadhaarNumber: item.sellerAadhaarNumber || '',
    purchaseDate: item.purchaseDate || '',
  }
}

async function shopRecordToProfile(pb, shop) {
  const logoField = Array.isArray(shop.logo) ? shop.logo[0] : shop.logo
  return {
    shopName: shop.name || '',
    legalName: shop.legalName || shop.name || '',
    logoData: logoField ? await fileUrlToDataUrl(pb.files.getURL(shop, logoField)) : '',
    address: shop.address || '',
    location: shop.location || '',
    phone: shop.phone || '',
    email: shop.email || '',
    gstin: shop.gstin || '',
    state: shop.state || '',
    stateCode: shop.stateCode || '',
    invoicePrefix: shop.invoicePrefix || 'INV',
    defaultBillType: shop.defaultBillType || 'NON GST',
    defaultGstRate: Number(shop.defaultGstRate || 18),
    hsnCode: shop.hsnCode || '8517',
    stickerShowPrice: shop.stickerShowPrice === undefined ? true : !!shop.stickerShowPrice,
    footer: shop.footer || '',
    terms: shop.terms || '',
    businessMode: shop.businessMode || 'general',
    enabledModules: parseEnabledModulesCsv(shop.enabledModulesCsv || ''),
  }
}

function shopProfileToRecord(profile, currentShop = {}) {
  return {
    shopId: currentShop.shopId || '',
    name: profile.shopName || currentShop.name || '',
    legalName: profile.legalName || '',
    address: profile.address || '',
    location: profile.location || '',
    phone: profile.phone || '',
    email: profile.email || '',
    gstin: profile.gstin || '',
    state: profile.state || '',
    stateCode: profile.stateCode || '',
    invoicePrefix: profile.invoicePrefix || 'INV',
    defaultBillType: profile.defaultBillType || 'NON GST',
    defaultGstRate: Number(profile.defaultGstRate || 18),
    hsnCode: profile.hsnCode || '8517',
    stickerShowPrice: profile.stickerShowPrice === undefined ? true : !!profile.stickerShowPrice,
    footer: profile.footer || '',
    terms: profile.terms || '',
    businessMode: profile.businessMode || 'general',
    enabledModulesCsv: Array.isArray(profile.enabledModules) ? profile.enabledModules.join(',') : String(profile.enabledModulesCsv || ''),
  }
}

function isPocketbaseId(value) {
  return /^[a-z0-9]{15}$/i.test(String(value || ''))
}

function inferMimeType(name = '') {
  const lower = String(name).toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function inferMimeTypeFromDataUrl(dataUrl = '') {
  const match = String(dataUrl).match(/^data:([^;,]+)[;,]/i)
  return match?.[1] || 'image/png'
}

function newestTimestamp(values) {
  return values.filter(Boolean).sort().at(-1) || ''
}

async function dataUrlToFile(dataUrl, fileName, mimeType) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], fileName, { type: mimeType || blob.type || 'application/octet-stream' })
}

async function fileUrlToDataUrl(url) {
  const response = await fetch(url)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

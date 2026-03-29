import { openDB } from 'idb'

const DB_NAME = 'phonedukaan-local-db'
const DB_VERSION = 1
const APP_STORE = 'appState'
const SYNC_STORE = 'syncState'
const PHOTO_STORE = 'photoBlobs'
const APP_KEY = 'primary'
const SYNC_KEY = 'primary'
const LEGACY_APP_LS_KEY = 'mobile-dukaan_v2'

let dbPromise = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(APP_STORE)) db.createObjectStore(APP_STORE)
        if (!db.objectStoreNames.contains(SYNC_STORE)) db.createObjectStore(SYNC_STORE)
        if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE)
      },
    })
  }
  return dbPromise
}

export async function loadAppState() {
  const db = await getDb()
  const stored = await db.get(APP_STORE, APP_KEY)
  if (stored) return stored

  if (typeof window !== 'undefined') {
    try {
      const legacy = JSON.parse(window.localStorage.getItem(LEGACY_APP_LS_KEY) || 'null')
      if (legacy?.inv && legacy?.tx) {
        await db.put(APP_STORE, legacy, APP_KEY)
        return legacy
      }
    } catch {
      // ignore invalid legacy localStorage payloads
    }
  }

  return null
}

export async function saveAppState(data) {
  const db = await getDb()
  await db.put(APP_STORE, data, APP_KEY)
}

export async function loadSyncState() {
  const db = await getDb()
  return (await db.get(SYNC_STORE, SYNC_KEY)) || null
}

export async function saveSyncState(data) {
  const db = await getDb()
  await db.put(SYNC_STORE, data, SYNC_KEY)
}

export async function savePhotoBlob(photoId, blob) {
  const db = await getDb()
  await db.put(PHOTO_STORE, blob, photoId)
}

export async function loadPhotoBlob(photoId) {
  const db = await getDb()
  return (await db.get(PHOTO_STORE, photoId)) || null
}

export async function deletePhotoBlob(photoId) {
  const db = await getDb()
  await db.delete(PHOTO_STORE, photoId)
}

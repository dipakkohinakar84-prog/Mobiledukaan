import { loadHandle, saveHandle, deleteHandle } from './app-storage.js'

const BILLS_DIR_KEY = 'billsDirectory'
const DIR_PERM = { mode: 'readwrite' }

export const isDirectoryPickerSupported = () =>
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

export const sanitizeFileName = (name) => {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim()
    .slice(0, 120)
  return cleaned || 'file'
}

const anchorDownload = (blob, fileName) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export async function getBillsDirectory() {
  try {
    const handle = await loadHandle(BILLS_DIR_KEY)
    if (!handle) return null
    if (typeof handle.queryPermission !== 'function') return handle
    const state = await handle.queryPermission(DIR_PERM)
    if (state === 'granted') return handle
    if (state === 'denied') {
      await deleteHandle(BILLS_DIR_KEY)
      return null
    }
    return null
  } catch {
    return null
  }
}

export async function pickBillsDirectory() {
  if (!isDirectoryPickerSupported()) {
    const error = new Error('This browser cannot pick a folder. Bills will be saved to your Downloads folder instead.')
    error.code = 'UNSUPPORTED'
    throw error
  }
  const handle = await window.showDirectoryPicker({ id: 'phonedukaan-bills', mode: 'readwrite', startIn: 'documents' })
  let state = typeof handle.queryPermission === 'function' ? await handle.queryPermission(DIR_PERM) : 'granted'
  if (state !== 'granted' && typeof handle.requestPermission === 'function') {
    state = await handle.requestPermission(DIR_PERM)
  }
  if (state !== 'granted') {
    const error = new Error('Folder access was not granted.')
    error.code = 'DENIED'
    throw error
  }
  await saveHandle(BILLS_DIR_KEY, handle)
  return handle
}

export async function clearBillsDirectory() {
  await deleteHandle(BILLS_DIR_KEY)
}

export async function writeFile(fileName, blob) {
  const safeName = sanitizeFileName(fileName)
  const directory = await getBillsDirectory()
  if (directory) {
    try {
      const fileHandle = await directory.getFileHandle(safeName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
      return { ok: true, mode: 'directory', fileName: safeName, path: `${directory.name}/${safeName}` }
    } catch {
      // Permission revoked or unsupported write: fall back to a plain download.
    }
  }
  try {
    anchorDownload(blob, safeName)
    return { ok: true, mode: 'download', fileName: safeName, path: `Downloads/${safeName}` }
  } catch (error) {
    return { ok: false, mode: 'none', fileName: safeName, error: error?.message || 'Unable to save the file.' }
  }
}

export async function requestPersistentStorage() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage) return false
    if (navigator.storage.persisted && await navigator.storage.persisted()) return true
    if (!navigator.storage.persist) return false
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function storageUsage() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return { supported: false, usage: 0, quota: 0, persisted: false }
    }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false
    return { supported: true, usage, quota, persisted }
  } catch {
    return { supported: false, usage: 0, quota: 0, persisted: false }
  }
}

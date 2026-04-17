const LS_KEY = 'ggmaster-state-v1'
const DB_NAME = 'ggmaster'
const DB_VERSION = 1
const STORE = 'images'

const DEFAULT_STATE = {
  subject: 'geology',
  histories: { geology: [], geography: [] },
  pinned: { geology: [], geography: [] },
}

export function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return structuredClone(DEFAULT_STATE)
    const parsed = JSON.parse(raw)
    return {
      subject: parsed.subject === 'geography' ? 'geography' : 'geology',
      histories: {
        geology: Array.isArray(parsed?.histories?.geology) ? parsed.histories.geology : [],
        geography: Array.isArray(parsed?.histories?.geography) ? parsed.histories.geography : [],
      },
      pinned: {
        geology: Array.isArray(parsed?.pinned?.geology) ? parsed.pinned.geology : [],
        geography: Array.isArray(parsed?.pinned?.geography) ? parsed.pinned.geography : [],
      },
    }
  } catch {
    return structuredClone(DEFAULT_STATE)
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch (err) {
    console.warn('saveState failed', err)
  }
}

let _dbPromise = null
function openDB() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return _dbPromise
}

export async function putImage({ id, base64, mediaType }) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ id, base64, mediaType })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getImage(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteImage(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function listImageIds() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAllKeys()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export function newImageId() {
  return 'img_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export async function pruneOrphans(referencedIds) {
  const ref = new Set(referencedIds)
  const all = await listImageIds()
  await Promise.all(all.filter((id) => !ref.has(id)).map((id) => deleteImage(id)))
}

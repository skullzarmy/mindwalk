// ── Secure API-key storage — IndexedDB + Web Crypto (AES-GCM / PBKDF2) ───────
// The API key is encrypted with a key derived from a user-supplied passphrase
// before it ever touches persistent storage.  Only the ciphertext + IV are
// written to IndexedDB; the passphrase and the derived crypto-key are kept
// exclusively in memory.
//
// Storage layout (IndexedDB database "mindwalk_secure"):
//   object-store "meta"  – { id: 'salt', value: Uint8Array(16) }
//   object-store "keys"  – { id: 'api_key', iv: number[], data: number[] }

const DB_NAME    = 'mindwalk_secure';
const DB_VERSION = 1;

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

async function dbPut(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(record);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── Salt management ───────────────────────────────────────────────────────────

async function getOrCreateSalt() {
  const record = await dbGet('meta', 'salt');
  if (record) return new Uint8Array(record.value);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await dbPut('meta', { id: 'salt', value: Array.from(salt) });
  return salt;
}

// ── Key derivation (PBKDF2 → AES-GCM) ────────────────────────────────────────

async function deriveKey(passphrase) {
  const encoder     = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  const salt = await getOrCreateSalt();
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypt `apiKey` with `passphrase` and persist to IndexedDB.
 * Throws if the Web Crypto API is unavailable.
 */
export async function saveEncryptedKey(apiKey, passphrase) {
  const key       = await deriveKey(passphrase);
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(apiKey),
  );
  await dbPut('keys', {
    id:   'api_key',
    iv:   Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  });
}

/**
 * Decrypt and return the stored API key.
 * Returns `null` when no key has been saved.
 * Throws `Error('incorrect-passphrase')` when the passphrase is wrong.
 */
export async function loadEncryptedKey(passphrase) {
  const record = await dbGet('keys', 'api_key');
  if (!record) return null;

  const key = await deriveKey(passphrase);
  const iv  = new Uint8Array(record.iv);
  const buf = new Uint8Array(record.data);

  try {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, buf);
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('incorrect-passphrase');
  }
}

/** Returns `true` when an encrypted key record exists in IndexedDB. */
export async function hasEncryptedKey() {
  try {
    const record = await dbGet('keys', 'api_key');
    return Boolean(record);
  } catch {
    return false;
  }
}

/** Remove the encrypted key (and its IV) from IndexedDB. */
export async function clearEncryptedKey() {
  await dbDelete('keys', 'api_key');
}

// ── Session-only storage (sessionStorage) ────────────────────────────────────
// Used when the user selects "Session only" — no persistence across tab closes.

const SESSION_KEY = 'mindwalk_session_key';

/** Save the API key in sessionStorage (cleared when the tab closes). */
export function saveSessionKey(apiKey) {
  sessionStorage.setItem(SESSION_KEY, apiKey);
}

/** Retrieve the session-only API key, or `null` if absent. */
export function getSessionKey() {
  return sessionStorage.getItem(SESSION_KEY);
}

/** Remove the session-only API key. */
export function clearSessionKey() {
  sessionStorage.removeItem(SESSION_KEY);
}

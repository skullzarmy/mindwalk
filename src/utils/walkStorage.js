/**
 * Client-side walk persistence helpers.
 * Walks are stored in localStorage as an array of { id, date, path } entries.
 * Export/import uses plain JSON blobs — no server involved.
 */

const STORAGE_KEY = 'mindwalk_saved_walks';
const MAX_SAVED_WALKS = 20;
const MAX_PATH_LENGTH = 500;
const MAX_WORD_LENGTH = 100;
const EXPORT_VERSION = 1;

/** Sanitise a single word: trim whitespace, enforce printable ASCII-ish chars */
function sanitiseWord(w) {
  if (typeof w !== 'string') throw new Error('Invalid word type in path');
  const trimmed = w.trim();
  if (trimmed.length === 0)        throw new Error('Empty word in path');
  if (trimmed.length > MAX_WORD_LENGTH) throw new Error('Word too long in path');
  // Allow letters, digits, hyphens, apostrophes — same character set the app uses
  if (!/^[\p{L}\p{N}\s'\-]+$/u.test(trimmed)) throw new Error('Word contains invalid characters (only letters, numbers, spaces, hyphens, and apostrophes allowed)');
  return trimmed;
}

/** Return all saved walks from localStorage, or [] on any error */
export function getSavedWalks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Basic shape validation
    return parsed.filter(
      w => w && typeof w.id === 'number' &&
           typeof w.date === 'string' &&
           Array.isArray(w.path) && w.path.length > 0
    );
  } catch {
    return [];
  }
}

/** Persist the current path to localStorage.  Returns the new entry. */
export function saveWalk(path) {
  if (!Array.isArray(path) || path.length === 0) return null;
  const entry = {
    id:   Date.now(),
    date: new Date().toISOString(),
    path: path.map(w => String(w)),
  };
  const existing = getSavedWalks();
  const updated  = [entry, ...existing].slice(0, MAX_SAVED_WALKS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return entry;
}

/** Delete a saved walk by id */
export function deleteSavedWalk(id) {
  const updated = getSavedWalks().filter(w => w.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/** Trigger a browser download of the walk as a JSON file */
export function exportWalk(path) {
  if (!Array.isArray(path) || path.length === 0) return;
  const payload = {
    version:    EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    path:       path.map(w => String(w)),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mindwalk-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parse and validate an imported JSON string.
 * Throws a descriptive Error if the content is invalid.
 * Returns the validated path array.
 */
export function parseImportedWalk(jsonString) {
  if (typeof jsonString !== 'string' || jsonString.length === 0) {
    throw new Error('Empty file');
  }
  if (jsonString.length > 1_000_000) {
    throw new Error('File too large (max 1 MB)');
  }
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON file');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid walk file format');
  }
  if (!Array.isArray(data.path) || data.path.length === 0) {
    throw new Error('Walk file has no path data');
  }
  if (data.path.length > MAX_PATH_LENGTH) {
    throw new Error(`Walk path too long (max ${MAX_PATH_LENGTH} words)`);
  }
  // Sanitise every word — throws on any invalid entry
  return data.path.map(sanitiseWord);
}

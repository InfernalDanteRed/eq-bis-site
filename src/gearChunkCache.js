import { openDB } from "idb";

const DB_NAME       = "BISGearChunks";
const DB_STORE      = "chunks";
const CACHE_VERSION = "v2";                  // bump this to invalidate all old entries
const CACHE_TTL     = 1000 * 60 * 60 * 24 * 30;   // 24 hours in milliseconds

// no more upgrade logic needed
const dbPromise = openDB(DB_NAME, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(DB_STORE)) {
      db.createObjectStore(DB_STORE);
    }
  },
});

/**
 * Get a chunk, using a versioned key and 24h expiration.
 */
export async function getOrFetchChunk(chunkId, fetchUrl) {
  const db  = await dbPromise;
  const key = `${CACHE_VERSION}-${chunkId}`;        // versioned key

  // 1) Try cached record
  const record = await db.get(DB_STORE, key);
  if (record) {
    const { timestamp, data } = record;
    // not expired?
    if (Date.now() - timestamp < CACHE_TTL) {
      return data;
    }
    // otherwise fallthrough to re-fetch
  }

  // 2) Fetch & store fresh
  const resp = await fetch(fetchUrl);
  if (!resp.ok) throw new Error(`Chunk fetch failed: ${resp.status}`);
  const data = await resp.json();

  await db.put(DB_STORE, { data, timestamp: Date.now() }, key);
  return data;
}

/** Clear *all* entries immediately (regardless of version). */
export async function clearChunkCache() {
  const db = await dbPromise;
  await db.clear(DB_STORE);
}
import { openDB } from "idb";

const DB_NAME    = "BISGearChunks";
const DB_VERSION = 2;
const STORE_NAME = "chunks";

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db, oldV, newV) {
    if (db.objectStoreNames.contains(STORE_NAME)) {
      db.deleteObjectStore(STORE_NAME);
    }
    db.createObjectStore(STORE_NAME);
    console.log(`DB upgraded v${oldV}→v${newV}; cache wiped.`);
  },
});

export async function getOrFetchChunk(rawKey, fetchUrl) {
  const key = String(rawKey);                   // ← always a string
  const db = await dbPromise;

  // Debug: print out what keys are in the store right now
  const allKeys = await db.getAllKeys(STORE_NAME);

  // 1) Try to get
  const cached = await db.get(STORE_NAME, key);
  if (cached) {
    return cached;
  }

  // 2) Miss → fetch, store, and return
  const response = await fetch(fetchUrl);
  if (!response.ok) throw new Error(`Fetch failed ${response.status}`);
  const data = await response.json();

  await db.put(STORE_NAME, data, key);
  return data;
}

export async function clearChunkCache() {
  const db = await dbPromise;
  await db.clear(STORE_NAME);
}
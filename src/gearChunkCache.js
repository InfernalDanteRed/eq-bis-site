import { openDB } from 'idb';

const DB_NAME = 'BISGearChunks';
const STORE_NAME = 'chunks';

const dbPromise = openDB(DB_NAME, 1, {
  upgrade(db) {
    db.createObjectStore(STORE_NAME);
  },
});

export async function getOrFetchChunk(chunkId, fetchUrl) {
  const db = await dbPromise;
  const cached = await db.get(STORE_NAME, chunkId);
  if (cached) {
    console.log("cached", cached);
    return cached;
  }
  const response = await fetch(fetchUrl);
  const data = await response.json();
  await db.put(STORE_NAME, data, chunkId);
  return data;
}

export async function clearChunkCache() {
  const db = await dbPromise;
  await db.clear(STORE_NAME);
}
/**
 * Storage abstraction layer.
 * 
 * In production (Vercel): uses Upstash Redis.
 * In development (local): uses in-memory Maps.
 * 
 * All methods are async to support both backends transparently.
 */

let redis = null;
let redisChecked = false;

// Try to load Upstash Redis; fall back to in-memory if unavailable
async function getRedis() {
  if (redisChecked) return redis;
  redisChecked = true;
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      console.log('[Storage] No Upstash Redis credentials, using in-memory storage');
      return null;
    }
    const { Redis } = await import('@upstash/redis');
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
    await redis.ping();
    console.log('[Storage] Using Upstash Redis');
    return redis;
  } catch (_e) {
    console.log('[Storage] Upstash Redis not available, using in-memory storage');
    redis = null;
    return null;
  }
}

// ─── In-memory fallback ───
const memoryStore = {
  datasets: new Map(),
  transcriptions: new Map()
};

// ─── Datasets ───

export async function getAllDatasets() {
  const remote = await getRedis();
  if (remote) {
    const keys = await remote.keys('ds:*');
    if (keys.length === 0) return {};
    const result = {};
    const pipe = remote.pipeline();
    for (const key of keys) pipe.get(key);
    const values = await pipe.exec();
    keys.forEach((key, i) => {
      const id = key.replace('ds:', '');
      if (values[i]) result[id] = values[i];
    });
    return result;
  }
  return Object.fromEntries(memoryStore.datasets);
}

export async function getDataset(id) {
  const remote = await getRedis();
  if (remote) {
    return await remote.get(`ds:${id}`);
  }
  return memoryStore.datasets.get(id) || null;
}

export async function setDataset(id, data) {
  const remote = await getRedis();
  if (remote) {
    // Store as JSON string for Upstash
    await remote.set(`ds:${id}`, JSON.stringify(data));
    return;
  }
  memoryStore.datasets.set(id, data);
}

export async function deleteDataset(id) {
  const remote = await getRedis();
  if (remote) {
    await remote.del(`ds:${id}`);
    return;
  }
  memoryStore.datasets.delete(id);
}

// ─── Transcription Results ───

export async function getTranscription(jobId) {
  const remote = await getRedis();
  if (remote) {
    return await remote.get(`tr:${jobId}`);
  }
  return memoryStore.transcriptions.get(jobId) || null;
}

export async function setTranscription(jobId, data) {
  const remote = await getRedis();
  if (remote) {
    // TTL of 24 hours for transcription results
    await remote.set(`tr:${jobId}`, JSON.stringify(data), { ex: 86400 });
    return;
  }
  memoryStore.transcriptions.set(jobId, data);
}

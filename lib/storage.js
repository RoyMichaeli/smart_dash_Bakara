/**
 * Storage abstraction layer.
 * 
 * In production (Vercel): uses Supabase Postgres.
 * In development (local): uses in-memory Maps.
 * 
 * Uses a single "kv_store" table:
 *   key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ
 * 
 * All methods are async to support both backends transparently.
 */

let supabase = null;
let supabaseChecked = false;
let tableReady = false;

async function getSupabase() {
  if (supabaseChecked) return supabase;
  supabaseChecked = true;
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.log('[Storage] No Supabase credentials, using in-memory storage');
      return null;
    }
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(url, key);
    // Quick connectivity check
    const { error } = await supabase.from('kv_store').select('key').limit(1);
    if (error && error.code === '42P01') {
      // Table doesn't exist — will be created via SQL migration
      console.log('[Storage] Supabase connected but kv_store table missing. Run the migration first.');
      console.log('[Storage] Falling back to in-memory storage');
      supabase = null;
      return null;
    }
    if (error) {
      console.log('[Storage] Supabase query error:', error.message);
      supabase = null;
      return null;
    }
    tableReady = true;
    console.log('[Storage] Using Supabase Postgres');
    return supabase;
  } catch (_e) {
    console.log('[Storage] Supabase not available, using in-memory storage');
    supabase = null;
    return null;
  }
}

// ─── In-memory fallback ───
const memoryStore = {
  datasets: new Map(),
  transcriptions: new Map()
};

// ─── Generic KV helpers ───

async function kvGet(key) {
  const sb = await getSupabase();
  if (sb) {
    const { data, error } = await sb.from('kv_store').select('value').eq('key', key).single();
    if (error || !data) return null;
    return data.value;
  }
  return null;
}

async function kvSet(key, value) {
  const sb = await getSupabase();
  if (sb) {
    await sb.from('kv_store').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  }
}

async function kvDelete(key) {
  const sb = await getSupabase();
  if (sb) {
    await sb.from('kv_store').delete().eq('key', key);
  }
}

async function kvListByPrefix(prefix) {
  const sb = await getSupabase();
  if (sb) {
    const { data, error } = await sb.from('kv_store').select('key, value').like('key', `${prefix}%`);
    if (error || !data) return [];
    return data;
  }
  return [];
}

// ─── Datasets ───

export async function getAllDatasets() {
  const sb = await getSupabase();
  if (sb) {
    const rows = await kvListByPrefix('ds:');
    const result = {};
    for (const row of rows) {
      const id = row.key.replace('ds:', '');
      result[id] = row.value;
    }
    return result;
  }
  return Object.fromEntries(memoryStore.datasets);
}

export async function getDataset(id) {
  const sb = await getSupabase();
  if (sb) {
    return await kvGet(`ds:${id}`);
  }
  return memoryStore.datasets.get(id) || null;
}

export async function setDataset(id, data) {
  const sb = await getSupabase();
  if (sb) {
    await kvSet(`ds:${id}`, data);
    return;
  }
  memoryStore.datasets.set(id, data);
}

export async function deleteDataset(id) {
  const sb = await getSupabase();
  if (sb) {
    await kvDelete(`ds:${id}`);
    return;
  }
  memoryStore.datasets.delete(id);
}

// ─── Transcription Results ───

export async function getTranscription(jobId) {
  const sb = await getSupabase();
  if (sb) {
    return await kvGet(`tr:${jobId}`);
  }
  return memoryStore.transcriptions.get(jobId) || null;
}

export async function setTranscription(jobId, data) {
  const sb = await getSupabase();
  if (sb) {
    await kvSet(`tr:${jobId}`, data);
    return;
  }
  memoryStore.transcriptions.set(jobId, data);
}

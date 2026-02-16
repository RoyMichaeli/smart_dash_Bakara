-- Run this SQL in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Creates the kv_store table used by the QA Smart dashboard for persistent storage

CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for prefix-based lookups (ds:*, tr:*)
CREATE INDEX IF NOT EXISTS idx_kv_store_key_prefix ON kv_store USING btree (key text_pattern_ops);

-- Enable Row Level Security (optional, service_role key bypasses RLS)
ALTER TABLE kv_store ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
CREATE POLICY "Service role full access" ON kv_store
  FOR ALL
  USING (true)
  WITH CHECK (true);

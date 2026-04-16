-- Run this once in your Supabase SQL editor or against your PostgreSQL instance

-- Stores every normalized content item that was fetched
CREATE TABLE IF NOT EXISTS content_items (
  id            TEXT PRIMARY KEY,          -- deterministic hash
  source_id     TEXT NOT NULL,
  source_name   TEXT NOT NULL,
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  url           TEXT,
  published_at  TIMESTAMPTZ NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score         INTEGER NOT NULL DEFAULT 0,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  sent          BOOLEAN NOT NULL DEFAULT FALSE,
  raw           JSONB
);

CREATE INDEX IF NOT EXISTS content_items_sent_idx       ON content_items (sent);
CREATE INDEX IF NOT EXISTS content_items_published_idx  ON content_items (published_at DESC);
CREATE INDEX IF NOT EXISTS content_items_source_idx     ON content_items (source_id);

-- Stores each digest that was sent to Telegram
CREATE TABLE IF NOT EXISTS digests (
  id            SERIAL PRIMARY KEY,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  markdown      TEXT NOT NULL,
  item_ids      TEXT[] NOT NULL DEFAULT '{}'
);

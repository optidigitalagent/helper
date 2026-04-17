-- Run in Supabase → SQL Editor

-- Tracks reputation of sources over time
-- Status flow: candidate → tracked → trusted (or rejected)
CREATE TABLE IF NOT EXISTS source_reputation (
  source_id      text PRIMARY KEY,
  source_name    text NOT NULL,
  feed_url       text,
  avg_quality    float  DEFAULT 0,
  signal_count   int    DEFAULT 0,
  sent_count     int    DEFAULT 0,   -- times items from this source made it into a digest
  status         text   DEFAULT 'candidate',  -- candidate|tracked|trusted|rejected
  last_signal_at timestamptz,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_reputation_status ON source_reputation (status);
CREATE INDEX IF NOT EXISTS source_reputation_avg_quality ON source_reputation (avg_quality DESC);

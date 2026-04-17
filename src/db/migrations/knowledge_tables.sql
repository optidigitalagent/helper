-- Run this in Supabase → SQL Editor before using /analyze command.

-- Stores LLM analysis of user-submitted links
CREATE TABLE IF NOT EXISTS analyzed_links (
  id              text PRIMARY KEY,
  url             text NOT NULL,
  title           text,
  source_name     text,
  content_type    text,             -- video|podcast|article|post|channel|interview|tool|site|unknown
  knowledge_type  text,             -- news|insight|deep_knowledge|tool|learning|podcast|thinking
  category        text,
  summary         text,
  why_it_matters  text,
  practical_value text,
  use_case        text,
  quality_score   integer DEFAULT 0,
  should_save     boolean DEFAULT false,
  raw_analysis    jsonb,
  created_at      timestamptz DEFAULT now()
);

-- Stores entities discovered inside analyzed content
-- (tools, people, channels, sources, companies)
CREATE TABLE IF NOT EXISTS discovered_entities (
  id            text PRIMARY KEY,
  entity_type   text NOT NULL,      -- tool|person|channel|source|company
  name          text NOT NULL,
  url           text,
  mentioned_in  text REFERENCES analyzed_links(id) ON DELETE SET NULL,
  notes         text,
  created_at    timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS analyzed_links_created_at  ON analyzed_links  (created_at DESC);
CREATE INDEX IF NOT EXISTS analyzed_links_should_save ON analyzed_links  (should_save);
CREATE INDEX IF NOT EXISTS discovered_entities_type   ON discovered_entities (entity_type);

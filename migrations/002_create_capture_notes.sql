-- Migration 002: capture_notes
-- Personal capture/checklist/call-summary storage
-- Run in: Supabase Dashboard → SQL Editor

create table if not exists capture_notes (
  id            uuid        primary key default gen_random_uuid(),
  chat_id       text        not null,
  type          text        not null
                            check (type in ('checklist', 'call_summary', 'client_notes', 'raw_note')),
  title         text        not null,
  topic         text        null,
  raw_text      text        not null,
  summary       text        not null default '',
  entities      jsonb       not null default '[]',
  done_items    jsonb       not null default '[]',
  waiting_items jsonb       not null default '[]',
  next_actions  jsonb       not null default '[]',
  tags          text[]      not null default '{}',
  metadata      jsonb       not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function update_capture_notes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_capture_notes_updated_at on capture_notes;
create trigger trg_capture_notes_updated_at
  before update on capture_notes
  for each row execute function update_capture_notes_updated_at();

-- Indexes
create index if not exists idx_capture_notes_chat_created
  on capture_notes (chat_id, created_at desc);

create index if not exists idx_capture_notes_created
  on capture_notes (created_at desc);

create index if not exists idx_capture_notes_type
  on capture_notes (type);

-- RLS disabled (service_role access only, same pattern as other tables)
alter table capture_notes disable row level security;

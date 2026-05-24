-- Migration: create reminders table
-- Run in: Supabase Dashboard → SQL Editor

create table if not exists reminders (
  id               uuid        primary key default gen_random_uuid(),
  user_id          text        null,
  chat_id          text        not null,
  source           text        not null default 'telegram',
  raw_text         text        not null,
  normalized_title text        not null,
  notes            text        null,
  due_at           timestamptz null,
  due_date         date        null,
  timezone         text        not null default 'Europe/Kyiv',
  priority         text        not null default 'normal'
                               check (priority in ('low', 'normal', 'high', 'urgent')),
  status           text        not null default 'active'
                               check (status in ('active', 'done', 'deleted')),
  tags             text[]      not null default '{}',
  metadata         jsonb       not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz null
);

-- Auto-update updated_at on row change
create or replace function update_reminders_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_reminders_updated_at on reminders;
create trigger trg_reminders_updated_at
  before update on reminders
  for each row execute function update_reminders_updated_at();

-- Indexes for common query patterns
create index if not exists idx_reminders_status_due_at
  on reminders (status, due_at);

create index if not exists idx_reminders_chat_status
  on reminders (chat_id, status);

create index if not exists idx_reminders_due_date_status
  on reminders (due_date, status);

-- Disable RLS (service_role access only — same pattern as other tables)
alter table reminders disable row level security;

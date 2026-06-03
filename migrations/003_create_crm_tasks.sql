-- Migration 003: crm_tasks
-- Mini-CRM for call-derived contact tasks
-- Run in: Supabase Dashboard → SQL Editor

create table if not exists crm_tasks (
  id              uuid        primary key default gen_random_uuid(),
  chat_id         text        not null,
  contact_name    text        not null,
  contact_phone   text        null,
  contact_type    text        not null default 'client'
                              check (contact_type in ('client', 'partner', 'lead', 'other')),
  agreement       text        not null default '',
  action_required text        not null,
  deadline_text   text        null,
  deadline_at     timestamptz null,
  next_step       text        null,
  comment         text        null,
  status          text        not null default 'active'
                              check (status in ('active', 'done', 'cancelled')),
  raw_text        text        not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz null
);

create or replace function update_crm_tasks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_crm_tasks_updated_at on crm_tasks;
create trigger trg_crm_tasks_updated_at
  before update on crm_tasks
  for each row execute function update_crm_tasks_updated_at();

create index if not exists idx_crm_tasks_chat_status
  on crm_tasks (chat_id, status);

create index if not exists idx_crm_tasks_status_deadline
  on crm_tasks (status, deadline_at);

create index if not exists idx_crm_tasks_created
  on crm_tasks (created_at desc);

alter table crm_tasks disable row level security;

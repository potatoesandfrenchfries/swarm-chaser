-- A research run moves through stages; every step is logged as an event, every
-- piece of material becomes an evidence row, and every claim cites evidence.
create extension if not exists pgcrypto;

create table if not exists public.research_runs (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  objective text null,
  status text not null default 'queued'
    check (status in ('queued', 'planning', 'searching', 'retrieving', 'drafting', 'verifying', 'completed', 'failed')),
  current_stage text not null default 'plan',
  plan_json jsonb null,
  final_report_markdown text null,
  error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.research_run_documents (
  run_id uuid not null references public.research_runs(id) on delete cascade,
  document_id text not null,
  file_name text null,
  primary key (run_id, document_id)
);

create table if not exists public.research_events (
  id bigserial primary key,
  run_id uuid not null references public.research_runs(id) on delete cascade,
  stage text not null,
  event_type text not null,
  message text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

-- The evidence ledger: web results and document chunks in one table, so a
-- claim can cite either the same way.
create table if not exists public.research_evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  source_type text not null check (source_type in ('web', 'document')),
  title text not null,
  url text null,
  excerpt text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.research_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  claim text not null,
  evidence_ids uuid[] not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  status text not null default 'draft' check (status in ('draft', 'verified', 'needs-review')),
  verification_notes text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists research_runs_created_at_idx on public.research_runs (created_at desc);
create index if not exists research_events_run_id_idx on public.research_events (run_id, id);
create index if not exists research_evidence_run_id_idx on public.research_evidence (run_id, created_at);
create index if not exists research_findings_run_id_idx on public.research_findings (run_id, created_at);

alter table public.research_runs enable row level security;
alter table public.research_run_documents enable row level security;
alter table public.research_events enable row level security;
alter table public.research_evidence enable row level security;
alter table public.research_findings enable row level security;

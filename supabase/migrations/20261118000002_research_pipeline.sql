-- =============================================================================
-- AI-assisted research pipeline (internal; never publicly readable).
--
-- Nothing in these tables changes the public dataset by itself. A proposal
-- reaches the content tables only through the approval function (phase 6),
-- invoked by an administrator.
-- RLS is enabled with NO policies: only the service role (Edge Functions,
-- server code) can access these tables until phase 2 adds admin policies.
-- =============================================================================

-- Administrators (the owner's Supabase Auth account) -----------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create type public.research_source_type as enum ('rss', 'api', 'curated');
create type public.research_run_status as enum ('running', 'succeeded', 'partial', 'failed');
create type public.research_run_trigger as enum ('scheduled', 'manual', 'retry');
create type public.analysis_status as enum ('pending', 'irrelevant', 'analyzed', 'no_change', 'proposed', 'failed');
create type public.entity_type as enum (
  'species', 'migration_route', 'archaeological_site', 'milestone', 'population_cluster', 'historical_period', 'source'
);
create type public.proposal_type as enum ('create', 'update', 'correction', 'additional_evidence');
create type public.review_status as enum ('pending', 'approved', 'rejected', 'edited');
create type public.review_action as enum ('approved', 'rejected', 'edited', 'conflict_detected');

-- Monitored sources ------------------------------------------------------------------
create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_url text not null,
  source_type public.research_source_type not null,
  feed_url text,
  api_endpoint text,
  is_active boolean not null default true,
  check_frequency interval not null default interval '3 days 12 hours',
  last_checked_at timestamptz,
  configuration jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint research_sources_endpoint check (
    (source_type = 'rss' and feed_url is not null) or
    (source_type = 'api' and api_endpoint is not null) or
    source_type = 'curated'
  )
);

-- Runs -------------------------------------------------------------------------------
create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  trigger public.research_run_trigger not null,
  retry_of uuid references public.research_runs (id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status public.research_run_status not null default 'running',
  sources_checked integer not null default 0,
  publications_discovered integer not null default 0,
  proposals_created integer not null default 0,
  errors jsonb not null default '[]',
  execution_summary text,
  constraint research_runs_completed check ((status = 'running') = (completed_at is null))
);
-- At most one run at a time: a scheduled and a manual run cannot overlap.
create unique index research_runs_single_running on public.research_runs ((true)) where status = 'running';
create index research_runs_started_idx on public.research_runs (started_at desc);

-- Discovered publications ----------------------------------------------------------------
create table public.research_updates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.research_sources (id),
  run_id uuid references public.research_runs (id),
  external_id text,
  doi text check (doi is null or doi = lower(doi)),
  normalized_url text,
  title text not null,
  authors text,
  journal text,
  abstract text,
  publication_date date,
  original_url text,
  is_peer_reviewed boolean,
  content_hash text not null,
  discovery_date timestamptz not null default now(),
  analysis_status public.analysis_status not null default 'pending',
  analysis jsonb,
  raw_metadata jsonb not null default '{}'
);
-- Deduplication: the same publication is stored once, whichever feed found it.
create unique index research_updates_doi_key on public.research_updates (doi) where doi is not null;
create unique index research_updates_external_key on public.research_updates (source_id, external_id) where external_id is not null;
create unique index research_updates_url_key on public.research_updates (normalized_url) where normalized_url is not null;
create index research_updates_status_idx on public.research_updates (analysis_status);

-- Proposals ----------------------------------------------------------------------------
create table public.update_proposals (
  id uuid primary key default gen_random_uuid(),
  research_update_id uuid references public.research_updates (id),
  entity_type public.entity_type not null,
  -- Null for 'create' until approved.
  entity_id text,
  proposal_type public.proposal_type not null,
  -- Version of the record the proposal was generated against (null for create).
  base_version integer,
  current_data jsonb,
  proposed_data jsonb not null,
  -- The administrator's revision (status 'edited'); approval publishes this instead.
  edited_data jsonb,
  finding_summary text not null,
  reasoning text not null,
  supporting_sources jsonb not null default '[]',
  confidence_score numeric(3, 2) check (confidence_score between 0 and 1),
  uncertainty_notes text,
  scientific_limitations text,
  review_status public.review_status not null default 'pending',
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint proposals_entity check (proposal_type = 'create' or entity_id is not null),
  constraint proposals_review check ((review_status in ('approved', 'rejected')) = (reviewed_at is not null))
);
create index update_proposals_status_idx on public.update_proposals (review_status, created_at desc);
create index update_proposals_entity_idx on public.update_proposals (entity_type, entity_id);

create table public.review_history (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.update_proposals (id),
  action public.review_action not null,
  previous_data jsonb,
  resulting_data jsonb,
  reviewer_id uuid references auth.users (id),
  notes text,
  created_at timestamptz not null default now()
);
create index review_history_proposal_idx on public.review_history (proposal_id, created_at);

-- Approved changes to the public dataset --------------------------------------------------
create table public.data_versions (
  id uuid primary key default gen_random_uuid(),
  entity_type public.entity_type not null,
  entity_id text not null,
  previous_data jsonb,
  new_data jsonb,
  proposal_id uuid references public.update_proposals (id),
  changed_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index data_versions_entity_idx on public.data_versions (entity_type, entity_id, created_at desc);

alter table public.admins enable row level security;
alter table public.research_sources enable row level security;
alter table public.research_runs enable row level security;
alter table public.research_updates enable row level security;
alter table public.update_proposals enable row level security;
alter table public.review_history enable row level security;
alter table public.data_versions enable row level security;

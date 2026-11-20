-- =============================================================================
-- Approved historical dataset (public content).
--
-- Conventions
--   * Text slug ids are kept as primary keys: the app, colour palettes and
--     intro timing are keyed by them.
--   * Years are "years before present" (positive integers, 0 = present).
--     Older bound >= younger bound, enforced by check constraints.
--   * `sort_order` / `position` keep the authored order: route and species
--     order define GPU indices and legend order.
--   * Every content table carries `version` (optimistic locking for the
--     approval workflow) and created_at / updated_at.
--   * RLS is enabled on every table with NO policies: nothing is readable
--     through the Supabase API until phase 2 adds explicit policies.
-- =============================================================================

create type public.confidence_level as enum ('high', 'medium', 'low');
create type public.evidence_type as enum ('archaeological', 'fossil', 'genetic', 'palaeoenvironmental', 'chronological');
create type public.data_status as enum ('evidence-based', 'illustrative');
create type public.hominin_genus as enum ('Homo', 'Australopithecus', 'Paranthropus');
create type public.species_group as enum ('sapiens', 'other');
create type public.milestone_category as enum (
  'stone-tools', 'fire', 'hunting-gathering', 'symbolic', 'language', 'clothing', 'seafaring',
  'pottery', 'domestication', 'agriculture', 'wine', 'settlement', 'metallurgy', 'writing'
);
create type public.milestone_icon as enum (
  'stone-tool', 'handaxe', 'fire', 'cooking', 'ornament', 'spear', 'engraving', 'cave-art', 'voice',
  'needle', 'boat', 'pottery', 'animal', 'herd', 'sprout', 'wine', 'settlement', 'metal', 'writing'
);
create type public.milestone_animation as enum ('flicker', 'rotate', 'draw', 'grow', 'drift', 'pour', 'glow');

-- updated_at + version bump on every update ------------------------------------
create function public.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

-- Dataset-level notes and disclaimers (shown in the UI) ------------------------
create table public.dataset_notes (
  key text primary key,
  body text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sources ------------------------------------------------------------------------
create table public.sources (
  id text primary key,
  sort_order integer not null,
  -- Which legacy file the record came from (migrations.json or sources.json).
  legacy_file text not null default 'sources' check (legacy_file in ('migrations', 'sources')),
  citation text not null,
  url text,
  -- Extracted from the URL when it is a doi.org link; lower-case.
  doi text,
  -- Filled from Crossref when the DOI is verified (phase 5); null until then.
  title text,
  authors text,
  publication text,
  publication_year integer,
  publisher text,
  source_type text,
  credibility_level text,
  last_checked_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_doi_lower check (doi is null or doi = lower(doi))
);
create unique index sources_doi_key on public.sources (doi) where doi is not null;
create unique index sources_order_key on public.sources (legacy_file, sort_order);

-- Species ------------------------------------------------------------------------
create table public.species (
  id text primary key,
  sort_order integer not null unique,
  name text not null,
  scientific_name text,
  genus public.hominin_genus not null,
  species_group public.species_group not null,
  classification text not null,
  taxonomy_note text not null,
  older_bp integer not null,
  younger_bp integer not null,
  time_note text not null,
  distribution text not null,
  physical text not null,
  technology text not null,
  relationships text not null,
  confidence public.confidence_level not null,
  camera jsonb not null,
  focus_year integer not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint species_time_order check (older_bp > younger_bp and younger_bp >= 0)
);

-- Archaeological sites -----------------------------------------------------------
create table public.archaeological_sites (
  id text primary key,
  sort_order integer not null unique,
  name text not null,
  region text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  older_bp integer not null,
  younger_bp integer not null,
  description text not null,
  details text,
  confidence public.confidence_level not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sites_time_order check (older_bp >= younger_bp and younger_bp >= 0)
);

-- Species the evidence at a site is attributed to. No rows = maker unknown.
create table public.site_species (
  site_id text not null references public.archaeological_sites (id) on delete cascade,
  species_id text not null references public.species (id),
  position integer not null,
  primary key (site_id, species_id),
  unique (site_id, position)
);

create table public.site_sources (
  site_id text not null references public.archaeological_sites (id) on delete cascade,
  source_id text not null references public.sources (id),
  position integer not null,
  primary key (site_id, source_id),
  unique (site_id, position)
);

create table public.species_sites (
  species_id text not null references public.species (id) on delete cascade,
  site_id text not null references public.archaeological_sites (id),
  position integer not null,
  primary key (species_id, site_id),
  unique (species_id, position)
);

create table public.species_sources (
  species_id text not null references public.species (id) on delete cascade,
  source_id text not null references public.sources (id),
  position integer not null,
  primary key (species_id, source_id),
  unique (species_id, position)
);

-- Historical periods (timeline bands) ------------------------------------------
create table public.historical_periods (
  id text primary key,
  sort_order integer not null unique,
  name text not null,
  short_name text,
  start_bp integer not null,
  end_bp integer not null,
  description text not null,
  confidence public.confidence_level not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint periods_time_order check (start_bp >= end_bp and end_bp >= 0)
);

-- Migration routes -----------------------------------------------------------------
-- `path` and `branches` keep the waypoint geometry exactly as the particle
-- engine consumes it: [{name, lat, lng, year}], years non-increasing.
create table public.migration_routes (
  id text primary key,
  sort_order integer not null unique,
  species_id text not null references public.species (id),
  name text not null,
  category text not null,
  path jsonb not null check (jsonb_typeof(path) = 'array' and jsonb_array_length(path) >= 2),
  branches jsonb check (branches is null or jsonb_typeof(branches) = 'array'),
  particle_config jsonb not null,
  confidence public.confidence_level not null,
  data_status public.data_status not null,
  uncertainty text not null,
  origin text not null,
  destination text not null,
  intermediate_regions text[] not null default '{}',
  path_description text not null,
  description text not null,
  people text not null,
  historical_context text not null,
  significance text not null,
  camera jsonb not null,
  -- Optional palette override; null = src/config/routeColors.ts.
  color text check (color is null or color ~ '^#[0-9a-f]{6}$'),
  older_bp integer generated always as ((path -> 0 ->> 'year')::integer) stored,
  younger_bp integer generated always as ((path -> (jsonb_array_length(path) - 1) ->> 'year')::integer) stored,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index migration_routes_species_idx on public.migration_routes (species_id);
create index migration_routes_time_idx on public.migration_routes (older_bp, younger_bp);

create table public.route_evidence (
  id uuid primary key default gen_random_uuid(),
  route_id text not null references public.migration_routes (id) on delete cascade,
  position integer not null,
  type public.evidence_type not null,
  description text not null,
  unique (route_id, position)
);

create table public.route_evidence_sources (
  evidence_id uuid not null references public.route_evidence (id) on delete cascade,
  source_id text not null references public.sources (id),
  position integer not null,
  primary key (evidence_id, source_id),
  unique (evidence_id, position)
);

create table public.route_sites (
  route_id text not null references public.migration_routes (id) on delete cascade,
  site_id text not null references public.archaeological_sites (id),
  position integer not null,
  primary key (route_id, site_id),
  unique (route_id, position)
);

-- Population clusters --------------------------------------------------------------
create table public.population_clusters (
  id text primary key,
  sort_order integer not null unique,
  species_id text not null references public.species (id),
  region text not null,
  lat double precision not null,
  lng double precision not null,
  lobes jsonb not null check (jsonb_typeof(lobes) = 'array' and jsonb_array_length(lobes) >= 1),
  start_bp integer not null,
  established_bp integer not null,
  end_bp integer,
  fade_years integer,
  growth_origin jsonb,
  -- A route id, 'ancestral' or 'species' (resolved to a colour by the app).
  color_from text not null,
  visual_density double precision not null check (visual_density > 0 and visual_density <= 1),
  confidence public.confidence_level not null,
  attested_bp integer,
  basis_note text not null,
  land_only boolean,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clusters_time_order check (start_bp > established_bp and (end_bp is null or end_bp < established_bp))
);

create table public.cluster_routes (
  cluster_id text not null references public.population_clusters (id) on delete cascade,
  route_id text not null references public.migration_routes (id),
  position integer not null,
  primary key (cluster_id, route_id),
  unique (cluster_id, position)
);

create table public.cluster_sites (
  cluster_id text not null references public.population_clusters (id) on delete cascade,
  site_id text not null references public.archaeological_sites (id),
  position integer not null,
  primary key (cluster_id, site_id),
  unique (cluster_id, position)
);

-- Milestones -----------------------------------------------------------------------
create table public.milestones (
  id text primary key,
  sort_order integer not null unique,
  title text not null,
  category public.milestone_category not null,
  approximate_start_bp integer not null,
  approximate_end_bp integer,
  date_label text not null,
  lat double precision not null,
  lng double precision not null,
  location_label text not null,
  location_approximate boolean,
  short_description text not null,
  detailed_description text not null,
  evidence text not null,
  origin_note text not null,
  significance text not null,
  evidence_type public.evidence_type not null,
  confidence public.confidence_level not null,
  visual_icon public.milestone_icon not null,
  animation_type public.milestone_animation not null,
  is_published boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestones_time_order check (approximate_end_bp is null or approximate_end_bp <= approximate_start_bp)
);

-- No rows = maker unknown.
create table public.milestone_species (
  milestone_id text not null references public.milestones (id) on delete cascade,
  species_id text not null references public.species (id),
  position integer not null,
  primary key (milestone_id, species_id),
  unique (milestone_id, position)
);

create table public.milestone_routes (
  milestone_id text not null references public.milestones (id) on delete cascade,
  route_id text not null references public.migration_routes (id),
  position integer not null,
  primary key (milestone_id, route_id),
  unique (milestone_id, position)
);

create table public.milestone_sites (
  milestone_id text not null references public.milestones (id) on delete cascade,
  site_id text not null references public.archaeological_sites (id),
  position integer not null,
  primary key (milestone_id, site_id),
  unique (milestone_id, position)
);

create table public.milestone_sources (
  milestone_id text not null references public.milestones (id) on delete cascade,
  source_id text not null references public.sources (id),
  position integer not null,
  evidence_description text,
  primary key (milestone_id, source_id),
  unique (milestone_id, position)
);

-- Triggers and RLS -------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['dataset_notes', 'sources', 'species', 'archaeological_sites', 'historical_periods',
                           'migration_routes', 'population_clusters', 'milestones'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_row()', t || '_touch', t);
  end loop;
  foreach t in array array['dataset_notes', 'sources', 'species', 'archaeological_sites', 'site_species', 'site_sources',
                           'species_sites', 'species_sources', 'historical_periods', 'migration_routes', 'route_evidence',
                           'route_evidence_sources', 'route_sites', 'population_clusters', 'cluster_routes', 'cluster_sites',
                           'milestones', 'milestone_species', 'milestone_routes', 'milestone_sites', 'milestone_sources'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

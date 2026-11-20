-- =============================================================================
-- Access control (phase 2).
--
--   * Public (anon) and signed-in users: read the approved dataset only.
--     Unpublished milestones are visible to administrators only.
--   * Nobody writes content through the API. Approved changes go through the
--     approval function (phase 6), which runs with elevated rights.
--   * Research pipeline tables: administrators can read; writes happen
--     server-side (Edge Functions, service role) or through admin functions.
--   * Grants are narrowed as well as RLS policies, so a missing policy can
--     never turn into write access.
--
-- NOTE: Supabase grants anon/authenticated full privileges on new tables in
-- `public` by default. Every later migration that adds a table must revoke and
-- grant explicitly, as below.
-- =============================================================================

-- Is the current user an administrator? -------------------------------------------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Content: public read, no API writes ---------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['dataset_notes', 'sources', 'species', 'archaeological_sites', 'site_species', 'site_sources',
                           'species_sites', 'species_sources', 'historical_periods', 'migration_routes', 'route_evidence',
                           'route_evidence_sources', 'route_sites', 'population_clusters', 'cluster_routes', 'cluster_sites'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy "Approved data is public" on public.%I for select to anon, authenticated using (true)', t);
  end loop;

  foreach t in array array['milestones', 'milestone_species', 'milestone_routes', 'milestone_sites', 'milestone_sources'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end;
$$;

create policy "Published milestones are public" on public.milestones
  for select to anon, authenticated
  using (is_published or (select public.is_admin()));

-- Link rows follow the visibility of their milestone (RLS on milestones applies inside the subquery).
create policy "Links of visible milestones" on public.milestone_species
  for select to anon, authenticated using (exists (select 1 from public.milestones m where m.id = milestone_id));
create policy "Links of visible milestones" on public.milestone_routes
  for select to anon, authenticated using (exists (select 1 from public.milestones m where m.id = milestone_id));
create policy "Links of visible milestones" on public.milestone_sites
  for select to anon, authenticated using (exists (select 1 from public.milestones m where m.id = milestone_id));
create policy "Links of visible milestones" on public.milestone_sources
  for select to anon, authenticated using (exists (select 1 from public.milestones m where m.id = milestone_id));

-- Research pipeline: administrators read; nothing for anon ---------------------------------
do $$
declare t text;
begin
  foreach t in array array['admins', 'research_sources', 'research_runs', 'research_updates', 'update_proposals',
                           'review_history', 'data_versions'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

-- A signed-in user can see whether they themselves are an administrator.
create policy "Own admin row" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Admins read research sources" on public.research_sources
  for select to authenticated using ((select public.is_admin()));
create policy "Admins read research runs" on public.research_runs
  for select to authenticated using ((select public.is_admin()));
create policy "Admins read discovered research" on public.research_updates
  for select to authenticated using ((select public.is_admin()));
create policy "Admins read proposals" on public.update_proposals
  for select to authenticated using ((select public.is_admin()));
create policy "Admins read review history" on public.review_history
  for select to authenticated using ((select public.is_admin()));
create policy "Admins read data versions" on public.data_versions
  for select to authenticated using ((select public.is_admin()));

-- Trigger helper is not callable through the API.
revoke execute on function public.touch_row() from public, anon, authenticated;

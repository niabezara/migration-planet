-- =============================================================================
-- Research discovery (phase 4): monitored sources and the functions the
-- discovery Edge Function calls. All functions run as their owner and are
-- executable by the service role only (the Edge Function), never by API users.
-- =============================================================================

-- Initial monitored sources ----------------------------------------------------------
-- RSS: official journal feeds (current issues). API: documented scholarly APIs,
-- queried with a publication-date window; `configuration` holds the queries.
insert into public.research_sources (name, base_url, source_type, feed_url, api_endpoint, check_frequency, configuration) values
  ('Nature', 'https://www.nature.com/nature', 'rss', 'https://www.nature.com/nature.rss', null, interval '3 days', '{}'),
  ('Nature Ecology & Evolution', 'https://www.nature.com/natecolevol', 'rss', 'https://www.nature.com/natecolevol.rss', null, interval '3 days', '{}'),
  ('Nature Communications', 'https://www.nature.com/ncomms', 'rss', 'https://www.nature.com/ncomms.rss', null, interval '3 days', '{}'),
  ('Science', 'https://www.science.org/journal/science', 'rss', 'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science', null, interval '3 days', '{}'),
  ('Science Advances', 'https://www.science.org/journal/sciadv', 'rss', 'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=sciadv', null, interval '3 days', '{}'),
  ('PNAS', 'https://www.pnas.org', 'rss', 'https://www.pnas.org/action/showFeed?type=etoc&feed=rss&jc=pnas', null, interval '3 days', '{}'),
  ('OpenAlex', 'https://openalex.org', 'api', null, 'https://api.openalex.org/works', interval '3 days',
   '{"adapter": "openalex", "search": "hominin OR hominins OR neanderthal OR neandertal OR denisovan OR \"Homo sapiens\" OR \"Homo erectus\" OR \"ancient DNA\" OR \"ancient genomes\" OR palaeolithic OR paleolithic OR mesolithic OR neolithic OR \"human evolution\" OR \"human dispersal\" OR archaeological", "maxPages": 3}'),
  ('Crossref', 'https://www.crossref.org', 'api', null, 'https://api.crossref.org/works', interval '3 days',
   '{"adapter": "crossref", "queries": ["hominin", "neanderthal", "denisovan", "ancient DNA human", "palaeolithic", "neolithic archaeology", "human dispersal prehistoric"], "rows": 40}');

-- Runs ---------------------------------------------------------------------------------
-- Starts a run, or returns null when another run is in progress. A run left
-- 'running' for over 30 minutes (a crashed function) is closed as failed first.
create function public.start_research_run(p_trigger public.research_run_trigger, p_retry_of uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.research_runs
     set status = 'failed', completed_at = now(),
         errors = errors || jsonb_build_array(jsonb_build_object('message', 'run did not finish (timed out or crashed)'))
   where status = 'running' and started_at < now() - interval '30 minutes';
  begin
    insert into public.research_runs (trigger, retry_of) values (p_trigger, p_retry_of) returning id into v_id;
  exception when unique_violation then
    return null; -- another run is in progress
  end;
  return v_id;
end;
$$;

create function public.finish_research_run(
  p_run uuid, p_status public.research_run_status, p_sources_checked integer,
  p_publications_discovered integer, p_errors jsonb, p_summary text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status = 'running' then raise exception 'a finished run cannot be running'; end if;
  update public.research_runs
     set status = p_status, completed_at = now(), sources_checked = p_sources_checked,
         publications_discovered = p_publications_discovered, errors = coalesce(p_errors, '[]'), execution_summary = p_summary
   where id = p_run and status = 'running';
  if not found then raise exception 'run % is not running', p_run; end if;
end;
$$;

-- Publications -------------------------------------------------------------------------
-- Stores a discovered publication once. Returns its id, or null when it is
-- already known (same DOI, same source + external id, or same normalised URL),
-- whichever source found it first.
create function public.record_research_update(p_source uuid, p_run uuid, p_item jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.research_updates (
    source_id, run_id, external_id, doi, normalized_url, title, authors, journal, abstract,
    publication_date, original_url, is_peer_reviewed, content_hash, raw_metadata
  ) values (
    p_source, p_run, p_item ->> 'externalId', lower(p_item ->> 'doi'), p_item ->> 'normalizedUrl', p_item ->> 'title',
    p_item ->> 'authors', p_item ->> 'journal', p_item ->> 'abstract', (p_item ->> 'publicationDate')::date,
    p_item ->> 'url', (p_item ->> 'isPeerReviewed')::boolean, p_item ->> 'contentHash', coalesce(p_item -> 'metadata', '{}')
  )
  on conflict do nothing
  returning id into v_id;
  return v_id;
end;
$$;

create function public.mark_research_source_checked(p_source uuid)
returns void language sql security definer set search_path = '' as $$
  update public.research_sources set last_checked_at = now() where id = p_source;
$$;

revoke execute on function public.start_research_run(public.research_run_trigger, uuid) from public, anon, authenticated;
revoke execute on function public.finish_research_run(uuid, public.research_run_status, integer, integer, jsonb, text) from public, anon, authenticated;
revoke execute on function public.record_research_update(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.mark_research_source_checked(uuid) from public, anon, authenticated;
grant execute on function public.start_research_run(public.research_run_trigger, uuid) to service_role;
grant execute on function public.finish_research_run(uuid, public.research_run_status, integer, integer, jsonb, text) to service_role;
grant execute on function public.record_research_update(uuid, uuid, jsonb) to service_role;
grant execute on function public.mark_research_source_checked(uuid) to service_role;

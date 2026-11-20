-- =============================================================================
-- Research analysis (phase 5).
--
-- The `research-analyze` Edge Function claims a few pending publications at a
-- time, asks Claude to analyse each against the current dataset, validates the
-- answer in code and stores the result. Proposals are only *stored* here, with
-- review_status 'pending'; nothing in this migration touches the public
-- dataset. Approval is phase 6.
-- =============================================================================

alter type public.analysis_status add value if not exists 'analyzing' after 'pending';

alter table public.research_updates
  add column analysis_attempts integer not null default 0,
  add column analysis_claimed_at timestamptz,
  add column analyzed_at timestamptz,
  add column analysis_error text;

alter table public.update_proposals
  -- Exact passages of the publication that support each proposed value.
  add column evidence_quotes jsonb not null default '[]',
  -- Fields the administrator must fill before approval (e.g. coordinates of a new site).
  add column requires_admin_input text[] not null default '{}',
  add column analysis_model text;

-- Claims up to p_limit publications for analysis: pending ones, and ones left
-- 'analyzing' for over 15 minutes (a crashed run). Concurrent callers never
-- get the same row (skip locked).
create function public.claim_research_updates(p_limit integer)
returns setof public.research_updates language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.research_updates u
     set analysis_status = 'analyzing', analysis_claimed_at = now(), analysis_attempts = u.analysis_attempts + 1
   where u.id in (
     select id from public.research_updates
      where (analysis_status = 'pending'
             or (analysis_status = 'analyzing' and analysis_claimed_at < now() - interval '15 minutes'))
        and analysis_attempts < 3
      order by discovery_date
      limit greatest(1, least(p_limit, 10))
      for update skip locked
   )
  returning u.*;
end;
$$;

-- Stores the outcome of one analysis atomically: the publication's status and
-- analysis, and any proposals (always 'pending' review).
create function public.complete_research_analysis(
  p_update uuid, p_status public.analysis_status, p_analysis jsonb, p_proposals jsonb
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer := 0; p jsonb;
begin
  if p_status not in ('irrelevant', 'no_change', 'proposed', 'failed') then
    raise exception 'invalid final analysis status %', p_status;
  end if;
  if (p_status = 'proposed') <> (jsonb_array_length(coalesce(p_proposals, '[]')) > 0) then
    raise exception 'status proposed requires proposals, and only it';
  end if;
  update public.research_updates
     set analysis_status = p_status, analysis = p_analysis, analyzed_at = now(), analysis_error = null
   where id = p_update and analysis_status = 'analyzing';
  if not found then raise exception 'publication % is not being analysed', p_update; end if;

  for p in select * from jsonb_array_elements(coalesce(p_proposals, '[]')) loop
    insert into public.update_proposals (
      research_update_id, entity_type, entity_id, proposal_type, base_version, current_data, proposed_data,
      finding_summary, reasoning, supporting_sources, confidence_score, uncertainty_notes, scientific_limitations,
      evidence_quotes, requires_admin_input, analysis_model
    ) values (
      p_update, (p ->> 'entity_type')::public.entity_type, p ->> 'entity_id', (p ->> 'proposal_type')::public.proposal_type,
      (p ->> 'base_version')::integer, p -> 'current_data', p -> 'proposed_data',
      p ->> 'finding_summary', p ->> 'reasoning', coalesce(p -> 'supporting_sources', '[]'), (p ->> 'confidence_score')::numeric,
      p ->> 'uncertainty_notes', p ->> 'scientific_limitations', coalesce(p -> 'evidence_quotes', '[]'),
      coalesce(array(select jsonb_array_elements_text(p -> 'requires_admin_input')), '{}'), p ->> 'analysis_model'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Records a failed attempt. After three attempts the publication is 'failed'
-- (shown to the administrator) instead of being retried forever.
-- (plpgsql, not sql: the body uses the enum value added above, which a SQL
-- function body would resolve inside this same transaction and reject.)
create function public.fail_research_analysis(p_update uuid, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.research_updates
     set analysis_status = case when analysis_attempts >= 3 then 'failed'::public.analysis_status else 'pending'::public.analysis_status end,
         analysis_error = left(p_error, 2000), analysis_claimed_at = null
   where id = p_update and analysis_status = 'analyzing';
end;
$$;

revoke execute on function public.claim_research_updates(integer) from public, anon, authenticated;
revoke execute on function public.complete_research_analysis(uuid, public.analysis_status, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_research_analysis(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_research_updates(integer) to service_role;
grant execute on function public.complete_research_analysis(uuid, public.analysis_status, jsonb, jsonb) to service_role;
grant execute on function public.fail_research_analysis(uuid, text) to service_role;

-- Schedule: every 15 minutes the analysis function takes the next few pending
-- publications. When nothing is pending it returns at once without calling
-- Claude, so idle runs cost nothing. Skipped where pg_cron is unavailable.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron unavailable: research analysis schedule not created';
    return;
  end if;
  execute $job$
    select cron.schedule(
      'research-analysis',
      '*/15 * * * *',
      $cmd$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'research_analyze_url'),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-research-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'research_cron_secret')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 5000
        )
        where exists (select 1 from public.research_updates where analysis_status in ('pending', 'analyzing'));
      $cmd$
    )
  $job$;
end;
$$;

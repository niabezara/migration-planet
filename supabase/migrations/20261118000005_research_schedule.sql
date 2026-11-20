-- =============================================================================
-- Scheduled research discovery: twice a week (Monday and Thursday, 05:00 UTC).
--
-- pg_cron calls the `research-discover` Edge Function through pg_net. The
-- function URL and the shared secret are read from Supabase Vault at run time
-- (secrets `research_function_url` and `research_cron_secret`), so no secret
-- is stored in this migration. See docs/research-pipeline.md for setup.
-- Change the schedule with: select cron.alter_job(job_id, schedule := '...').
--
-- Skipped where pg_cron / pg_net are unavailable (local tests on PGlite).
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron or pg_net unavailable: research schedule not created';
    return;
  end if;

  execute 'create extension if not exists pg_cron';
  execute 'create extension if not exists pg_net with schema extensions';

  execute $job$
    select cron.schedule(
      'research-discovery',
      '0 5 * * 1,4',
      $cmd$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'research_function_url'),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-research-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'research_cron_secret')
          ),
          body := '{"trigger": "scheduled"}'::jsonb,
          timeout_milliseconds := 5000
        );
      $cmd$
    )
  $job$;
end;
$$;

# Supabase setup

The historical dataset lives in Supabase Postgres. `src/data/*.json` remain as the seed source and as the server-side fallback.

## How the app gets its data (phase 3)

1. `src/app/page.tsx` (server) calls `getPublicDataset()` (`src/data/server/getPublicDataset.ts`), a `"use cache"` function tagged `dataset`.
2. It reads the content tables through the Supabase REST API with the publishable key (RLS: approved data only), rebuilds the JSON-file shape (`exportDataset`) and validates it with `buildDataset()`.
3. If Supabase is not configured, unreachable, empty, or returns data that fails validation, it serves the JSON files bundled with the server instead and logs the reason. That fallback is cached for minutes, the database result for an hour; approving a proposal will invalidate the `dataset` tag immediately (phase 6).
4. `<DatasetProvider>` installs the validated dataset into `@/data`, so the globe, timeline and panels keep importing from `@/data` unchanged. A new dataset version remounts the scene.

The page is still prerendered as a static shell at build time, and the dataset is no longer part of the browser JS bundle. Scripts install the JSON files themselves (`scripts/useJsonDataset.ts`).

## What is in the repository

| Path | Purpose |
|---|---|
| `supabase/migrations/20261118000001_content_schema.sql` | Public dataset tables: species, routes, sites, periods, population clusters, milestones, sources and their link tables. |
| `supabase/migrations/20261118000002_research_pipeline.sql` | Internal pipeline tables: admins, research sources, runs, discovered publications, proposals, review history, data versions. |
| `supabase/seed.sql` | The current dataset as SQL inserts. **Generated** — do not edit by hand. |
| `src/data/db/toSeedSql.ts` | JSON → SQL (used to generate the seed). |
| `src/data/db/exportDataset.ts` | Database → JSON (the exact file shapes). |
| `tests/db/*.test.ts` | Schema and round-trip tests on an in-process Postgres (PGlite). |

## Commands

```bash
npm run db:seed   # regenerate supabase/seed.sql after editing src/data/*.json
npm test          # schema + round-trip tests (no Docker, no Supabase project needed)
npm run verify    # existing particle-engine and data checks
```

The round-trip test imports every JSON file into Postgres, exports it again and requires the result to be identical to the files, so no field is lost.

## Access control (phase 2)

Migration `20261118000003_access_policies.sql`:

| Who | Approved dataset | Unpublished milestones | Research pipeline tables | Writes through the API |
|---|---|---|---|---|
| Visitor (anon key) | read | — | permission denied | none |
| Signed-in, not admin | read | — | no rows | none |
| Administrator | read | read | read | none (approval runs through server functions, phase 6) |

Grants are narrowed as well as policies. Supabase grants the API roles full privileges on new `public` tables by default, so **every new migration that adds a table must revoke and grant explicitly**.

`tests/db/access.test.ts` checks these rules on PGlite with Supabase's default grants emulated.

### Admin sign-in (magic link)

- `/admin/login` sends a one-time link, but only to `ADMIN_EMAIL`; other addresses get the same neutral reply and no email.
- The link lands on `/auth/confirm`, which creates the session and continues to `/admin`.
- `/admin` checks the session with Supabase Auth and asks the database (`is_admin()`) whether the user is an administrator.
- `src/proxy.ts` refreshes the session cookie on `/admin` routes only; the public globe never runs it.
- Supabase Auth must allow the redirect URL `http://localhost:3000/auth/confirm` (set in `supabase/config.toml`, pushed with `npx supabase config push`). Add the production URL there when the site is deployed.

### Making an account an administrator

1. Sign in once at `/admin/login` (this creates the Auth user; the page then says the account is not an administrator).
2. Add the user to `public.admins` (SQL editor or `npx supabase db query --linked`):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = '<admin email>';
   ```
3. Disable new sign-ups: `enable_signup = false` under `[auth]` in `config.toml`, then `npx supabase config diff` and `npx supabase config push`. Leave `[auth.email] enable_signup` on: it controls the email provider itself, and turning it off would also block the admin's magic link.

## Applying to your Supabase project

You need the project ref (from the dashboard URL `supabase.com/dashboard/project/<ref>`) and the database password.

```bash
npx supabase login                          # opens the browser once
npx supabase link --project-ref <ref>       # asks for the database password
npx supabase db push --dry-run              # shows the two migrations that would run
npx supabase db push --include-seed         # creates the schema and imports the dataset
```

`db push` records applied migrations, so running it again applies only new ones. Run the seed only once on an empty database: it inserts rows and fails on duplicates rather than overwriting data.

## Local development (optional)

A full local Supabase stack needs Docker: `npx supabase start`, then `npx supabase db reset` applies migrations and the seed. The tests do not need it.

## Environment variables

See `.env.example`. Browser-safe values use the `NEXT_PUBLIC_` prefix; the secret key, the Claude API key and the research contact email are server-side or Edge Function secrets only.

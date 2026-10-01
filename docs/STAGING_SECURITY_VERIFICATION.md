# Staging security verification

Status on October 1, 2026: **NOT_RUN**. No hosted database, migration, account,
or provider credential was changed during the stabilization campaign.

Use an isolated staging project with two disposable authenticated accounts.
Record the project reference, commit/tree, lockfile hash, migration inventory,
engine payload hash, UTC execution time, and redacted results. Local SQL tests
and a successful server startup are not a substitute for these results.

The checked-in authority is `supabase/migrations/`, especially atomic result
persistence in `0012`, execution grants in `0017`/`0025`, pinned function search
paths in `0027`, caller alignment in `0028`, and the timestamped hardening
migration. Inspect the actual applied migration order before applying changes.
Do not blindly concatenate historical migrations against an existing database.

## Read-only catalog inspection

Run these queries through the staging SQL editor or a server-side connection.
Keep service credentials out of browser configuration and report artifacts.

```sql
select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
order by tablename, policyname;

select p.oid::regprocedure as function_signature, p.prosecdef,
       p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as user_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and
      (p.prosecdef or p.proname = 'persist_match_result')
order by function_signature;
```

Compare each function's effective permissions with its checked-in contract.
`persist_match_result(jsonb)` must be executable by the trusted server role and
unavailable to ordinary clients. Player-readable RPCs have separate contracts;
do not revoke them as a blanket fix. Check a pinned search path on every
SECURITY DEFINER function, table grants, and effective row visibility.
Supabase documents both [function execution privileges](https://supabase.com/docs/guides/database/functions)
and [behavioral RLS testing](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Disposable-account behavioral proof

1. As anonymous and as each authenticated account, attempt direct result/rating
   writes and the result RPC. Require denial. Read the other account's private
   settings, relationships, moderation information, and replay resources;
   require denial according to each resource's documented audience.
2. Exercise permitted own-profile/settings changes and public player/leaderboard
   reads. Check row contents and response shapes, not only HTTP status codes.
3. Start the server with production auth, explicit HTTPS origins, durable SQLite
   and outbox paths, and a server-only staging credential. Play a ranked result
   using real identities and a real provisioned season. Confirm result,
   participants, rating history and current ratings are committed together.
4. Retry the identical match result. Require one match result and exactly one
   rating application. Attempt an invalid participant/rating record and confirm
   that no partial rows survive. Record before/after counts for the affected IDs.
5. Interrupt delivery, restart using the same SQLite/outbox files, and confirm
   eventual delivery without duplicated results or ratings. Repeat with the
   transactional RPC unavailable: the server must retain/retry the failed job,
   never use compatibility multi-request writes in production.
6. Verify WebSocket rejection for missing/unapproved origins, expired and forged
   identities, private replay downloads, and unauthorized omniscient projections.
   Inspect redacted server logs and the built browser files for secret leakage.

These are instructions for an authorized staging run, not claims that the run
occurred. Save actual evidence under ignored `reports/release/` with exact
provenance before promoting a release candidate. Credential rotation/revocation
requires provider evidence and remains a separate operator-owned gate.

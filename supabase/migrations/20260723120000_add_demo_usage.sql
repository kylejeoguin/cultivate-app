-- demo_usage: per-bucket, per-day counter for the PUBLIC /api/demo-tag endpoint that powers
-- the /try landing-page demo. That endpoint has NO auth (a logged-out visitor uses it), so
-- this table is the denial-of-wallet backstop: it caps calls per hashed-IP bucket
-- ('ip:<sha256>') AND a single 'global' bucket per day (the global cap is what stops a botnet
-- rotating IPs from running up the LLM bill).
--
-- SERVER-ONLY BY DESIGN (same posture as spark_usage): RLS is ENABLED with NO policies at all,
-- so the anon + authenticated roles get ZERO access. Only the service-role key (used in
-- /api/demo-tag) can read or write. Tamper-proof by construction. No user_id, no PII — an IP is
-- stored only as a truncated SHA-256 bucket key, never raw.
create table if not exists public.demo_usage (
  bucket     text    not null,        -- 'ip:<sha256-hash>' or 'global'
  usage_date date    not null,
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket, usage_date)
);

alter table public.demo_usage enable row level security;
-- Intentionally NO policies: service-role bypasses RLS; every other role is denied all access.

comment on table public.demo_usage is
  'Per-bucket/day counter for the public /api/demo-tag demo. Bucket = hashed-IP or ''global''. Reads+writes: service-role only. Denial-of-wallet cap for the unauthenticated /try demo.';

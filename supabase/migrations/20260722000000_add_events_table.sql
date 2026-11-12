-- First-party acquisition analytics: one row per site landing (and, later, per funnel event).
--
-- Purpose: answer "how many humans came through THIS specific link, and from where" — the
-- thing signup_source can't tell us because it only fires on the few visitors who convert.
--
-- Design note (intentionally generic, so we never re-migrate to extend it):
--   * event_type is a free-ish label ('visit' today) — length-checked, NOT a fixed enum — so
--     future funnel events ('cta_click', 'signup_start', …) are new ROWS, not a schema change.
--   * metadata jsonb is the catch-all for anything we capture later without adding columns.
--   * `query` stores the RAW query string, so a link that someday carries ?fbclid/?gclid/?ref
--     is still fully recorded even though we don't parse those today. Can't regret a stored field.
--
-- Privacy: NO IP, NO user-agent string, NO fingerprint stored. Source/UTM + coarse country +
-- coarse device class + a first-party per-session id only. This tracks WHERE a visit came from,
-- never WHO the visitor is.
--
-- RLS mirrors public.feedback's shape but inverted for a public sink: anyone (anon or signed-in)
-- may INSERT a landing; NOBODY reads via anon/authenticated — reads are service-role only
-- (Flint via MCP / a future admin page via the service client). Reads can't be scraped.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  event_type text not null default 'visit'
    check (char_length(event_type) between 1 and 50),

  -- first-party session dedupe id (random, generated client-side; NOT identity)
  session_id text check (session_id is null or char_length(session_id) <= 100),

  -- where they landed
  path text check (path is null or char_length(path) <= 1024),

  -- attribution
  source       text check (source       is null or char_length(source)       <= 200),
  utm_source   text check (utm_source   is null or char_length(utm_source)   <= 200),
  utm_medium   text check (utm_medium   is null or char_length(utm_medium)   <= 200),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 200),
  utm_content  text check (utm_content  is null or char_length(utm_content)  <= 200),
  utm_term     text check (utm_term     is null or char_length(utm_term)     <= 200),

  -- raw insurance + coarse context
  query         text check (query         is null or char_length(query)         <= 2048),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 255),
  country       text check (country       is null or char_length(country)       <= 8),
  device        text check (device is null or device in ('mobile','desktop','tablet','unknown')),
  is_bot        boolean not null default false,

  metadata jsonb not null default '{}'::jsonb
);

alter table public.events enable row level security;

-- Public sink: anyone may record a landing. Reads intentionally NOT granted to anon/authenticated.
create policy "Anyone can insert events"
  on public.events for insert to anon, authenticated
  with check (true);

grant insert on public.events to anon, authenticated;
grant all on public.events to service_role;

-- Reporting indexes: recent-first, and sliceable by the attribution keys we group on.
create index if not exists idx_events_created      on public.events (created_at desc);
create index if not exists idx_events_type_created on public.events (event_type, created_at desc);
create index if not exists idx_events_campaign     on public.events (utm_campaign, created_at desc) where utm_campaign is not null;
create index if not exists idx_events_source       on public.events (source, created_at desc) where source is not null;

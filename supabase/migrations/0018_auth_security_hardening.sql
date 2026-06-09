-- =============================================================================
-- Human Signal Index — 0018_auth_security_hardening.sql
-- Phase 14 — Auth, Security & Access Control Hardening.
--
-- Phase 14 adds a PLATFORM-SECURITY telemetry layer: structured logs for auth
-- diagnostics, security audit events, login attempts, session lifecycle events,
-- access (authorization) denials, plus an admin triage queue for reviewing them.
-- These power the Security dashboard (health checks, failed-login feeds,
-- access-denial feeds, recent security events) and an admin review workflow.
--
--   * auth_diagnostics        — health/diagnostic probes for auth + dependent services;
--   * security_audit_events   — general security audit trail (per user/event/severity);
--   * login_attempts          — login attempts (success/failure) keyed by email + ip;
--   * session_events          — session lifecycle events (created/refreshed/revoked/…);
--   * access_denials          — authorization denials (route + required vs actual role);
--   * admin_security_reviews   — admin triage/review records over the above signals.
--
-- ---------------------------------------------------------------------------
-- NAMING — these are PLATFORM-SECURITY tables, intentionally NOT `hsin_`-prefixed
-- (they are cross-cutting infrastructure, not part of the narrative-intelligence
-- graph). They are named EXACTLY as specified by the Phase 14 spec.
--
-- COLLISION CHECK: 0001 already defines `security_events` and `audit_logs`.
-- Phase 14 deliberately uses DIFFERENT names (`security_audit_events`,
-- `auth_diagnostics`, etc.) — there is NO name collision with any existing table,
-- and this migration does NOT touch 0001's `security_events`/`audit_logs`.
-- ---------------------------------------------------------------------------
--
-- This migration is ADD-ONLY. It creates 6 new tables (+ indexes, RLS, policies,
-- one updated_at trigger). It does NOT edit migrations 0001-0017, drop existing
-- policies/roles/helpers, or touch any existing table/RLS.
--
-- CONVENTIONS (match 0001-0017):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz not null default now().
--   - user_id uuid references public.users(id) on delete set null (NULLABLE — a
--     security event may have no associated user, e.g. a failed login for an
--     unknown email or an anonymous request).
--   - enum-style text columns guarded by CHECK constraints.
--   - RLS via the existing SECURITY DEFINER helper public.is_admin() (0002).
--   - The shared public.set_updated_at() trigger (from 0003) is attached ONLY to
--     admin_security_reviews (the one mutable, edited-in-place table).
--
-- ACCESS MODEL:
--   - ADMINS can read ALL rows on every table (public.is_admin()) and have full
--     control everywhere (for all using/with check is_admin()).
--   - On the event tables (security_audit_events, session_events, access_denials,
--     auth_diagnostics) a user may read THEIR OWN rows (user_id = auth.uid()).
--   - login_attempts is ADMIN-ONLY read: rows carry other users' emails and may
--     have a NULL user_id (failed logins for unknown accounts), so there is NO
--     self-read policy.
--   - INSERT on the event tables is allowed for any authenticated caller
--     (with check auth.uid() is not null) so the app can log events for the
--     current user/session.
--   - admin_security_reviews: only admins insert/update (triage is admin-only).
--   - The worker/server may use the Supabase service_role key, which BYPASSES RLS
--     entirely — it can log events and write reviews regardless of these policies.
-- =============================================================================

-- =============================================================================
-- A. TABLES
-- =============================================================================

-- ---------- auth_diagnostics --------------------------------------------------
-- Health/diagnostic probes for auth and dependent services. `service` names the
-- probed dependency, `code` carries a machine-readable status/error code, and
-- `ok` records the boolean pass/fail of the probe.
create table if not exists public.auth_diagnostics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  event_type  text,
  severity    text check (severity in ('info','warning','error','critical')),
  ip_address  text,
  user_agent  text,
  route       text,
  message     text,
  metadata    jsonb,
  code        text,
  service     text,
  ok          boolean,
  created_at  timestamptz not null default now()
);
comment on table public.auth_diagnostics is
  'HSI Phase 14: health/diagnostic probes for auth + dependent services (service/code/ok).';

-- ---------- security_audit_events ---------------------------------------------
-- General security audit trail. One row per security-relevant event, tagged by
-- user, event_type, and severity.
create table if not exists public.security_audit_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  event_type  text,
  severity    text check (severity in ('info','warning','error','critical')),
  ip_address  text,
  user_agent  text,
  route       text,
  message     text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.security_audit_events is
  'HSI Phase 14: general security audit trail (per user/event_type/severity). Distinct from 0001 security_events.';

-- ---------- login_attempts ----------------------------------------------------
-- Login attempts, success or failure, keyed by `email` (may be an unknown
-- account, so user_id can be NULL) and source `ip_address`. ADMIN-ONLY read.
create table if not exists public.login_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  event_type  text,
  severity    text check (severity in ('info','warning','error','critical')),
  ip_address  text,
  user_agent  text,
  route       text,
  message     text,
  metadata    jsonb,
  email       text,
  success     boolean default false,
  created_at  timestamptz not null default now()
);
comment on table public.login_attempts is
  'HSI Phase 14: login attempts (success/failure) keyed by email + ip. Admin-only read (carries other users'' emails, may have null user_id).';

-- ---------- session_events ----------------------------------------------------
-- Session lifecycle events (e.g. created / refreshed / revoked / expired) for a
-- user.
create table if not exists public.session_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  event_type  text,
  severity    text check (severity in ('info','warning','error','critical')),
  ip_address  text,
  user_agent  text,
  route       text,
  message     text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.session_events is
  'HSI Phase 14: session lifecycle events (created/refreshed/revoked/expired) for a user.';

-- ---------- access_denials ----------------------------------------------------
-- Authorization denials. Records the protected `route` and the `required_role`
-- vs the caller's `actual_role` at the time access was refused.
create table if not exists public.access_denials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id) on delete set null,
  event_type    text,
  severity      text check (severity in ('info','warning','error','critical')),
  ip_address    text,
  user_agent    text,
  route         text,
  message       text,
  metadata      jsonb,
  required_role text,
  actual_role   text,
  created_at    timestamptz not null default now()
);
comment on table public.access_denials is
  'HSI Phase 14: authorization denials (route + required_role vs actual_role).';

-- ---------- admin_security_reviews --------------------------------------------
-- Admin triage/review queue over the above security signals. `reviewed_by` is the
-- admin who handled it, `status` tracks the triage state, `notes` carries the
-- review write-up. This is the ONE mutable, edited-in-place table here, so it
-- carries an updated_at column + the shared set_updated_at trigger.
create table if not exists public.admin_security_reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.users(id) on delete set null,
  event_type   text,
  severity     text check (severity in ('info','warning','error','critical')),
  ip_address   text,
  user_agent   text,
  route        text,
  message      text,
  metadata     jsonb,
  reviewed_by  uuid references public.users(id) on delete set null,
  status       text check (status in ('open','reviewed','dismissed','escalated')) default 'open',
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz default now()
);
comment on table public.admin_security_reviews is
  'HSI Phase 14: admin triage/review queue over security signals (reviewed_by/status/notes).';

-- =============================================================================
-- B. INDEXES — common filter columns
-- =============================================================================
create index if not exists idx_auth_diagnostics_created_at on public.auth_diagnostics(created_at);
create index if not exists idx_auth_diagnostics_severity   on public.auth_diagnostics(severity);

create index if not exists idx_security_audit_events_user_id    on public.security_audit_events(user_id);
create index if not exists idx_security_audit_events_event_type on public.security_audit_events(event_type);
create index if not exists idx_security_audit_events_severity   on public.security_audit_events(severity);
create index if not exists idx_security_audit_events_created_at on public.security_audit_events(created_at);

create index if not exists idx_login_attempts_email      on public.login_attempts(email);
create index if not exists idx_login_attempts_success    on public.login_attempts(success);
create index if not exists idx_login_attempts_created_at on public.login_attempts(created_at);
create index if not exists idx_login_attempts_ip_address on public.login_attempts(ip_address);

create index if not exists idx_session_events_user_id    on public.session_events(user_id);
create index if not exists idx_session_events_event_type on public.session_events(event_type);
create index if not exists idx_session_events_created_at on public.session_events(created_at);

create index if not exists idx_access_denials_user_id    on public.access_denials(user_id);
create index if not exists idx_access_denials_route      on public.access_denials(route);
create index if not exists idx_access_denials_created_at on public.access_denials(created_at);

create index if not exists idx_admin_security_reviews_status     on public.admin_security_reviews(status);
create index if not exists idx_admin_security_reviews_created_at on public.admin_security_reviews(created_at);

-- =============================================================================
-- C. UPDATED_AT TRIGGER — only on admin_security_reviews.
-- Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
-- The 5 event tables are append-only (never edited in place) and carry no
-- updated_at column, so no trigger is attached to them.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.admin_security_reviews;
create trigger trg_set_updated_at before update on public.admin_security_reviews
  for each row execute function public.set_updated_at();

-- =============================================================================
-- D. ENABLE RLS on all 6 new tables
-- =============================================================================
alter table public.auth_diagnostics       enable row level security;
alter table public.security_audit_events   enable row level security;
alter table public.login_attempts          enable row level security;
alter table public.session_events          enable row level security;
alter table public.access_denials          enable row level security;
alter table public.admin_security_reviews   enable row level security;

-- =============================================================================
-- E. POLICIES
-- Convention (matches 0002/0017): permissive policies are OR-combined — a row is
-- visible/writable if ANY policy allows it. Drop-then-create for idempotency.
--
-- Shape for the 5 EVENT tables:
--   admin_all  : admins have full control          (for all  is_admin());
--   admin_read : admins read all rows              (for select is_admin());  [redundant with admin_all but explicit per spec]
--   self_read  : a user reads their own rows        (for select user_id = auth.uid());  [NOT on login_attempts]
--   auth_ins   : any authenticated caller may log   (for insert auth.uid() is not null);
-- The worker/server may use the service_role key, which BYPASSES RLS entirely.
--
-- admin_security_reviews: admin-only read/insert/update (triage is admin-only).
-- =============================================================================

-- ---------- auth_diagnostics --------------------------------------------------
drop policy if exists auth_diagnostics_admin_all  on public.auth_diagnostics;
drop policy if exists auth_diagnostics_admin_read on public.auth_diagnostics;
drop policy if exists auth_diagnostics_self_read  on public.auth_diagnostics;
drop policy if exists auth_diagnostics_auth_ins   on public.auth_diagnostics;

create policy auth_diagnostics_admin_all on public.auth_diagnostics
  for all using (public.is_admin()) with check (public.is_admin());
create policy auth_diagnostics_admin_read on public.auth_diagnostics
  for select using (public.is_admin());
create policy auth_diagnostics_self_read on public.auth_diagnostics
  for select using (user_id = auth.uid());
create policy auth_diagnostics_auth_ins on public.auth_diagnostics
  for insert with check (auth.uid() is not null);

-- ---------- security_audit_events ---------------------------------------------
drop policy if exists security_audit_events_admin_all  on public.security_audit_events;
drop policy if exists security_audit_events_admin_read on public.security_audit_events;
drop policy if exists security_audit_events_self_read  on public.security_audit_events;
drop policy if exists security_audit_events_auth_ins   on public.security_audit_events;

create policy security_audit_events_admin_all on public.security_audit_events
  for all using (public.is_admin()) with check (public.is_admin());
create policy security_audit_events_admin_read on public.security_audit_events
  for select using (public.is_admin());
create policy security_audit_events_self_read on public.security_audit_events
  for select using (user_id = auth.uid());
create policy security_audit_events_auth_ins on public.security_audit_events
  for insert with check (auth.uid() is not null);

-- ---------- login_attempts ----------------------------------------------------
-- ADMIN-ONLY read (no self_read: rows carry other users' emails and may have a
-- NULL user_id). Authenticated callers may still INSERT attempt records.
drop policy if exists login_attempts_admin_all  on public.login_attempts;
drop policy if exists login_attempts_admin_read on public.login_attempts;
drop policy if exists login_attempts_auth_ins   on public.login_attempts;

create policy login_attempts_admin_all on public.login_attempts
  for all using (public.is_admin()) with check (public.is_admin());
create policy login_attempts_admin_read on public.login_attempts
  for select using (public.is_admin());
create policy login_attempts_auth_ins on public.login_attempts
  for insert with check (auth.uid() is not null);

-- ---------- session_events ----------------------------------------------------
drop policy if exists session_events_admin_all  on public.session_events;
drop policy if exists session_events_admin_read on public.session_events;
drop policy if exists session_events_self_read  on public.session_events;
drop policy if exists session_events_auth_ins   on public.session_events;

create policy session_events_admin_all on public.session_events
  for all using (public.is_admin()) with check (public.is_admin());
create policy session_events_admin_read on public.session_events
  for select using (public.is_admin());
create policy session_events_self_read on public.session_events
  for select using (user_id = auth.uid());
create policy session_events_auth_ins on public.session_events
  for insert with check (auth.uid() is not null);

-- ---------- access_denials ----------------------------------------------------
drop policy if exists access_denials_admin_all  on public.access_denials;
drop policy if exists access_denials_admin_read on public.access_denials;
drop policy if exists access_denials_self_read  on public.access_denials;
drop policy if exists access_denials_auth_ins   on public.access_denials;

create policy access_denials_admin_all on public.access_denials
  for all using (public.is_admin()) with check (public.is_admin());
create policy access_denials_admin_read on public.access_denials
  for select using (public.is_admin());
create policy access_denials_self_read on public.access_denials
  for select using (user_id = auth.uid());
create policy access_denials_auth_ins on public.access_denials
  for insert with check (auth.uid() is not null);

-- ---------- admin_security_reviews --------------------------------------------
-- Admin-only triage queue: admins read/insert/update; no self-read, no
-- authenticated insert (only admins create or edit reviews).
drop policy if exists admin_security_reviews_admin_all  on public.admin_security_reviews;
drop policy if exists admin_security_reviews_admin_read on public.admin_security_reviews;
drop policy if exists admin_security_reviews_admin_ins  on public.admin_security_reviews;
drop policy if exists admin_security_reviews_admin_upd  on public.admin_security_reviews;

create policy admin_security_reviews_admin_all on public.admin_security_reviews
  for all using (public.is_admin()) with check (public.is_admin());
create policy admin_security_reviews_admin_read on public.admin_security_reviews
  for select using (public.is_admin());
create policy admin_security_reviews_admin_ins on public.admin_security_reviews
  for insert with check (public.is_admin());
create policy admin_security_reviews_admin_upd on public.admin_security_reviews
  for update using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. Server-side jobs and the
-- middleware/security worker (logging auth diagnostics, security audit events,
-- login attempts, session events, and access denials, and writing admin reviews)
-- use it. User-facing reads/writes go through the per-request, cookie-backed
-- client and are authorized by the policies above. NEVER expose service_role to
-- clients.
-- =============================================================================

-- =============================================================================
-- End of 0018_auth_security_hardening.sql
-- =============================================================================

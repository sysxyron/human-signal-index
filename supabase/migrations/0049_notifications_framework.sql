-- =============================================================================
-- HSI Phase 62 — Notifications & Alerting Framework.
--
-- The first platform-wide notification infrastructure: owner-scoped in-app
-- notifications, per-user delivery preferences, and an audit/event log. ADDITIVE
-- only — no existing table/column/policy is modified. Internal storage only; no
-- external email provider in this phase (delivery comes later).
--
-- SECURITY MODEL (RLS):
--   * notifications        — owner-scoped (user_id = auth.uid()); admins may read
--                            + manage all (public.is_admin()) for platform alert
--                            monitoring + the executive summary. NO cross-user
--                            visibility for non-admins.
--   * notification_preferences — strictly owner-managed; admins may read.
--   * notification_events  — visible to the owner of the parent notification and
--                            to admins; insert by owner/admin. Append-only audit.
--
-- IDEMPOTENT (Phase 61.1 lesson): create-if-not-exists + add-column-if-not-exists
-- before any dependent index, and drop-policy-if-exists before create. Safe to
-- re-run against empty / partial / fully-applied schemas.
-- =============================================================================

-- ---- notifications ----------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  type text not null check (type in (
    'SOURCE_FAILURE', 'SOURCE_RECOVERED', 'SIGNAL_SUBMITTED', 'SIGNAL_ESCALATED',
    'REVIEW_REQUIRED', 'REVIEW_APPROVED', 'REVIEW_REJECTED', 'PUBLICATION_PUBLISHED',
    'CORRECTION_RECEIVED', 'WATCHLIST_MATCH', 'FORECAST_TRIGGER', 'SYSTEM_ALERT',
    'SECURITY_EVENT', 'BETA_FEEDBACK'
  )),
  severity text not null default 'INFO' check (severity in ('INFO', 'NOTICE', 'WARNING', 'CRITICAL')),
  title text not null,
  body text,
  link text,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.notifications add column if not exists user_id uuid;
alter table public.notifications add column if not exists organization_id uuid references public.organizations (id) on delete set null;
alter table public.notifications add column if not exists type text;
alter table public.notifications add column if not exists severity text not null default 'INFO';
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists body text;
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists entity_type text;
alter table public.notifications add column if not exists entity_id text;
alter table public.notifications add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.notifications add column if not exists read_at timestamptz;
alter table public.notifications add column if not exists archived_at timestamptz;
alter table public.notifications add column if not exists created_by uuid references public.users (id) on delete set null;
alter table public.notifications add column if not exists created_at timestamptz not null default now();
alter table public.notifications add column if not exists updated_at timestamptz;
create index if not exists idx_notifications_user_created on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_unread on public.notifications (user_id, read_at);
create index if not exists idx_notifications_user_archived on public.notifications (user_id, archived_at);
create index if not exists idx_notifications_type on public.notifications (type);
create index if not exists idx_notifications_severity on public.notifications (severity);
create index if not exists idx_notifications_org on public.notifications (organization_id);

-- ---- notification_preferences (one row per user) ----------------------------
create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  email_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  critical_only boolean not null default false,
  digest_frequency text not null default 'daily' check (digest_frequency in ('realtime', 'hourly', 'daily', 'weekly', 'off')),
  source_alerts boolean not null default true,
  review_alerts boolean not null default true,
  publication_alerts boolean not null default true,
  forecast_alerts boolean not null default true,
  system_alerts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.notification_preferences add column if not exists user_id uuid;
alter table public.notification_preferences add column if not exists email_enabled boolean not null default true;
alter table public.notification_preferences add column if not exists in_app_enabled boolean not null default true;
alter table public.notification_preferences add column if not exists critical_only boolean not null default false;
alter table public.notification_preferences add column if not exists digest_frequency text not null default 'daily';
alter table public.notification_preferences add column if not exists source_alerts boolean not null default true;
alter table public.notification_preferences add column if not exists review_alerts boolean not null default true;
alter table public.notification_preferences add column if not exists publication_alerts boolean not null default true;
alter table public.notification_preferences add column if not exists forecast_alerts boolean not null default true;
alter table public.notification_preferences add column if not exists system_alerts boolean not null default true;
alter table public.notification_preferences add column if not exists created_at timestamptz not null default now();
alter table public.notification_preferences add column if not exists updated_at timestamptz;

-- ---- notification_events (append-only audit / delivery log) ------------------
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  event text not null check (event in ('created', 'read', 'unread', 'archived', 'delivered', 'suppressed')),
  channel text,
  actor_id uuid references public.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.notification_events add column if not exists notification_id uuid;
alter table public.notification_events add column if not exists event text;
alter table public.notification_events add column if not exists channel text;
alter table public.notification_events add column if not exists actor_id uuid references public.users (id) on delete set null;
alter table public.notification_events add column if not exists note text;
alter table public.notification_events add column if not exists created_at timestamptz not null default now();
create index if not exists idx_notification_events_notification on public.notification_events (notification_id);

-- ---- RLS --------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_events enable row level security;

-- notifications: owner reads/updates own; admin reads + manages all. Owner (or
-- admin) may insert a row addressed to the owner; archive is a soft-delete via
-- update (no owner DELETE — only admins may hard-delete).
drop policy if exists notifications_owner_read on public.notifications;
create policy notifications_owner_read on public.notifications
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists notifications_owner_insert on public.notifications;
create policy notifications_owner_insert on public.notifications
  for insert with check (auth.uid() = user_id or public.is_admin());
drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications
  for update using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
drop policy if exists notifications_admin_delete on public.notifications;
create policy notifications_admin_delete on public.notifications
  for delete using (public.is_admin());

-- preferences: strictly owner-managed; admins may read (for support/monitoring).
drop policy if exists notification_preferences_owner_all on public.notification_preferences;
create policy notification_preferences_owner_all on public.notification_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists notification_preferences_admin_read on public.notification_preferences;
create policy notification_preferences_admin_read on public.notification_preferences
  for select using (public.is_admin());

-- events: visible to the parent notification's owner + admins; insert likewise.
drop policy if exists notification_events_read on public.notification_events;
create policy notification_events_read on public.notification_events
  for select using (
    public.is_admin()
    or exists (select 1 from public.notifications n where n.id = notification_id and n.user_id = auth.uid())
  );
drop policy if exists notification_events_insert on public.notification_events;
create policy notification_events_insert on public.notification_events
  for insert with check (
    public.is_admin()
    or exists (select 1 from public.notifications n where n.id = notification_id and n.user_id = auth.uid())
  );

-- =============================================================================
-- Human Signal Index — 0042_stripe_billing.sql
-- WorldForge / HSI (Phase 38, v1.1) — Stripe billing & subscription automation.
--
-- Adds the Stripe integration layer on top of the Phase-37 commercial foundation:
-- customer mapping, mirrored subscriptions, webhook event ledger (replay-safe),
-- invoice cache, and an append-only billing audit log. Extends
-- organization_subscriptions + organization_usage with Stripe/period/cycle fields.
--
-- GOVERNANCE: billing data is org-isolated (member read; org-admin/admin write).
-- Webhooks write via the service-role (server-only) — bypasses RLS by design, as
-- with the worker. NO RBAC/auth/user_roles changes. ADD-ONLY (0001-0041).
-- =============================================================================

-- =============================================================================
-- A. STRIPE CUSTOMERS — org ↔ Stripe customer mapping.
-- =============================================================================
create table if not exists public.stripe_customers (
  organization_id    uuid primary key references public.organizations(id) on delete cascade,
  stripe_customer_id text not null unique,
  email              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz default now()
);
comment on table public.stripe_customers is 'HSI Phase 38: organization ↔ Stripe customer mapping.';
create index if not exists idx_stripe_customers_cust on public.stripe_customers(stripe_customer_id);

-- =============================================================================
-- B. STRIPE SUBSCRIPTIONS — mirror of the live Stripe subscription per org.
-- =============================================================================
create table if not exists public.stripe_subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade unique,
  stripe_customer_id     text not null,
  stripe_subscription_id text not null unique,
  plan_id                uuid references public.plans(id) on delete set null,
  status                 text not null default 'active'
                           check (status in ('trialing','active','past_due','unpaid','paused','canceled','incomplete','incomplete_expired')),
  billing_cycle          text not null default 'monthly' check (billing_cycle in ('monthly','annual')),
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  trial_end              timestamptz,
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz default now()
);
comment on table public.stripe_subscriptions is 'HSI Phase 38: per-org mirror of the live Stripe subscription.';
create index if not exists idx_stripe_subs_cust on public.stripe_subscriptions(stripe_customer_id);
create index if not exists idx_stripe_subs_status on public.stripe_subscriptions(status);

-- =============================================================================
-- C. STRIPE EVENTS — webhook ledger (idempotency / replay protection).
--    unique(stripe_event_id) enforces exactly-once processing at the DB layer.
-- =============================================================================
create table if not exists public.stripe_events (
  id              uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type            text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  payload         jsonb not null,
  processed       boolean not null default false,
  processed_at    timestamptz,
  error           text,
  created_at      timestamptz not null default now()
);
comment on table public.stripe_events is 'HSI Phase 38: raw Stripe webhook events — replay-safe (unique event id).';
create index if not exists idx_stripe_events_type on public.stripe_events(type, created_at desc);

-- =============================================================================
-- D. BILLING INVOICES — cache of Stripe-hosted invoices for display.
-- =============================================================================
create table if not exists public.billing_invoices (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  stripe_invoice_id  text not null unique,
  number             text,
  amount_due         bigint not null default 0,
  amount_paid        bigint not null default 0,
  currency           text not null default 'usd',
  status             text not null default 'draft',
  hosted_invoice_url text,
  invoice_pdf        text,
  invoice_created_at timestamptz,
  created_at         timestamptz not null default now()
);
comment on table public.billing_invoices is 'HSI Phase 38: cached Stripe invoices (hosted URLs) per org.';
create index if not exists idx_billing_invoices_org on public.billing_invoices(organization_id, invoice_created_at desc);

-- =============================================================================
-- E. BILLING AUDIT LOG — APPEND-ONLY (checkout, portal, sync, usage resets).
-- =============================================================================
create table if not exists public.billing_audit_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor           uuid references public.users(id) on delete set null,
  action          text not null,
  previous_value  jsonb,
  new_value       jsonb,
  source          text not null default 'app' check (source in ('app','webhook','system')),
  created_at      timestamptz not null default now()
);
comment on table public.billing_audit_log is 'HSI Phase 38: APPEND-ONLY billing change log (app + webhook + system).';
create index if not exists idx_billing_audit_org on public.billing_audit_log(organization_id, created_at desc);

-- =============================================================================
-- F. EXTEND Phase-37 tables (additive columns; non-breaking).
-- =============================================================================
alter table public.organization_subscriptions
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists billing_cycle          text not null default 'monthly',
  add column if not exists current_period_start   timestamptz,
  add column if not exists current_period_end     timestamptz,
  add column if not exists cancel_at_period_end   boolean not null default false,
  add column if not exists trial_ends_at          timestamptz;

alter table public.organization_usage
  add column if not exists signals      integer not null default 0,
  add column if not exists last_reset_at timestamptz;

-- =============================================================================
-- updated_at triggers for the mutable new tables.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['stripe_customers','stripe_subscriptions']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end$$;

-- =============================================================================
-- RLS.
--   customers / subscriptions / invoices : org members read; admin all.
--                                          (webhooks write via service-role.)
--   events     : admin read/all only (raw payloads — never org-visible).
--   audit      : org-admins + admins read; admin all (append-only by policy).
-- =============================================================================
alter table public.stripe_customers enable row level security;
drop policy if exists stripe_customers_admin_all on public.stripe_customers;
drop policy if exists stripe_customers_member_read on public.stripe_customers;
create policy stripe_customers_admin_all on public.stripe_customers for all using (public.is_admin()) with check (public.is_admin());
create policy stripe_customers_member_read on public.stripe_customers for select using (public.is_org_member(organization_id));

alter table public.stripe_subscriptions enable row level security;
drop policy if exists stripe_subs_admin_all on public.stripe_subscriptions;
drop policy if exists stripe_subs_member_read on public.stripe_subscriptions;
create policy stripe_subs_admin_all on public.stripe_subscriptions for all using (public.is_admin()) with check (public.is_admin());
create policy stripe_subs_member_read on public.stripe_subscriptions for select using (public.is_org_member(organization_id));

alter table public.stripe_events enable row level security;
drop policy if exists stripe_events_admin_all on public.stripe_events;
create policy stripe_events_admin_all on public.stripe_events for all using (public.is_admin()) with check (public.is_admin());

alter table public.billing_invoices enable row level security;
drop policy if exists billing_invoices_admin_all on public.billing_invoices;
drop policy if exists billing_invoices_member_read on public.billing_invoices;
create policy billing_invoices_admin_all on public.billing_invoices for all using (public.is_admin()) with check (public.is_admin());
create policy billing_invoices_member_read on public.billing_invoices for select using (public.is_org_member(organization_id));

alter table public.billing_audit_log enable row level security;
drop policy if exists billing_audit_admin_all on public.billing_audit_log;
drop policy if exists billing_audit_org_admin_read on public.billing_audit_log;
create policy billing_audit_admin_all on public.billing_audit_log for all using (public.is_admin()) with check (public.is_admin());
create policy billing_audit_org_admin_read on public.billing_audit_log for select using (public.is_org_admin(organization_id));

-- =============================================================================
-- NOTE
-- The web DAL drives Stripe-hosted checkout + the billing portal (no card data
-- ever touches HSI). The webhook endpoint verifies signatures, records raw events
-- to stripe_events (replay-safe), and syncs stripe_subscriptions ->
-- organization_subscriptions so @hsi/entitlements resolves the right plan. Premium
-- entitlements apply only while access is active (trial/active/past_due); lapsed
-- orgs fall back to community. No RBAC/auth/user_roles changes; org isolation kept.
-- =============================================================================

-- =============================================================================
-- End of 0042_stripe_billing.sql
-- =============================================================================

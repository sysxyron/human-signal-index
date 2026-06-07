-- =============================================================================
-- 0006_auth_users_trigger.sql — Supabase Auth ↔ public.users linkage
-- -----------------------------------------------------------------------------
-- Phase 2.75. The entire RLS model (migrations 0002 + 0005) assumes
-- `public.users.id == auth.uid()`. Supabase Auth creates rows in `auth.users`;
-- this migration mirrors each new auth user into `public.users` (same id) so
-- that:
--   * WorldForge owner policies (`created_by = auth.uid()`) resolve correctly,
--   * `current_app_role()` (which joins user_roles -> roles) can find the user,
--   * foreign keys `*.created_by -> public.users(id)` are satisfiable.
--
-- It also assigns a default 'viewer' role and backfills any auth users that
-- already exist (e.g. created before this trigger was installed).
--
-- Idempotent and safe to re-run. Does NOT modify 0005_worldforge.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. handle_new_user(): insert a matching public.users row + default role.
--    SECURITY DEFINER so the trigger can write to public.* and read roles
--    regardless of the (none) RLS context of the auth subsystem.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
  viewer_role_id uuid;
begin
  -- Prefer a name from auth metadata, else the local-part of the email.
  display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  -- Mirror into public.users using the SAME id as auth.users.
  insert into public.users (id, email, name)
  values (new.id, new.email, display_name)
  on conflict (id) do update
    set email = excluded.email,
        name  = coalesce(public.users.name, excluded.name);

  -- Assign the default 'viewer' role if the roles table is seeded.
  select id into viewer_role_id from public.roles where name = 'viewer' limit 1;
  if viewer_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    select new.id, viewer_role_id
    where not exists (
      select 1 from public.user_roles
      where user_id = new.id and role_id = viewer_role_id
    );
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Mirrors a new auth.users row into public.users (same id) and grants the default viewer role. Keeps public.users.id == auth.uid() for RLS.';

-- ---------------------------------------------------------------------------
-- 2. Trigger on auth.users insert.
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Keep public.users.email in sync when the auth email changes.
-- ---------------------------------------------------------------------------
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.users set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- 4. Backfill: mirror any existing auth.users that predate this trigger.
-- ---------------------------------------------------------------------------
insert into public.users (id, email, name)
select
  au.id,
  au.email,
  coalesce(
    nullif(au.raw_user_meta_data ->> 'name', ''),
    nullif(au.raw_user_meta_data ->> 'full_name', ''),
    split_part(coalesce(au.email, ''), '@', 1)
  )
from auth.users au
on conflict (id) do nothing;

-- Grant default viewer role to any backfilled users lacking it.
insert into public.user_roles (user_id, role_id)
select u.id, r.id
from public.users u
cross join (select id from public.roles where name = 'viewer' limit 1) r
where not exists (
  select 1 from public.user_roles ur where ur.user_id = u.id and ur.role_id = r.id
);

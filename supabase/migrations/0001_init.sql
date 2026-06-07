-- Human Signal Index schema

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  created_at timestamp with time zone default now()
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text
);

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  role_id uuid references roles(id) on delete cascade
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_type text not null,
  public_url text,
  platform text,
  status text not null default 'active',
  tags text[] default array[]::text[],
  risk_baseline int default 1,
  last_checked_at timestamp with time zone,
  added_by text,
  notes text,
  created_at timestamp with time zone default now()
);

create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id) on delete cascade,
  title text not null,
  summary text,
  signal_type text not null,
  status text not null default 'draft',
  category text[] default array[]::text[],
  risk_score int default 1,
  created_at timestamp with time zone default now()
);

create table if not exists evidence_items (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals(id) on delete cascade,
  kind text not null,
  content text not null,
  metadata jsonb,
  hash_digest text not null,
  captured_at timestamp with time zone default now(),
  chain_of_custody text,
  reviewer_notes text
);

create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals(id) on delete cascade,
  transcript text not null,
  created_at timestamp with time zone default now()
);

create table if not exists classifications (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals(id) on delete cascade,
  category text not null,
  score numeric not null,
  created_at timestamp with time zone default now()
);

create table if not exists category_taxonomy (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text
);

create table if not exists risk_scores (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals(id) on delete cascade,
  risk_level int not null,
  quote text not null,
  explanation text not null,
  confidence numeric not null,
  reviewer_status text not null,
  recommended_action text not null,
  created_at timestamp with time zone default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals(id) on delete cascade,
  user_id uuid references users(id),
  status text not null,
  notes text,
  created_at timestamp with time zone default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals(id),
  title text not null,
  level text not null,
  description text not null,
  created_at timestamp with time zone default now()
);

create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals(id),
  provider text not null,
  prompt text not null,
  response text not null,
  provenance jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists ai_trace_passages (
  id uuid primary key default gen_random_uuid(),
  ai_run_id uuid references ai_runs(id) on delete cascade,
  source_text text not null,
  generated_text text not null,
  confidence numeric not null
);

create table if not exists generated_content (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals(id),
  content text not null,
  content_type text not null,
  provenance jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public_reports (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals(id),
  title text not null,
  summary text not null,
  citations jsonb,
  published boolean default false,
  reviewer_status text not null,
  created_at timestamp with time zone default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  action text not null,
  metadata jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  details text,
  level text not null,
  created_at timestamp with time zone default now()
);

create table if not exists source_changes (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id),
  change_type text not null,
  details jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists uploaded_files (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id),
  signal_id uuid references signals(id),
  file_name text not null,
  file_type text not null,
  file_url text not null,
  created_at timestamp with time zone default now()
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals(id),
  user_id uuid references users(id),
  body text not null,
  created_at timestamp with time zone default now()
);

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  description text
);

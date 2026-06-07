/**
 * Human Signal Index — local setup helper.
 *
 * Verifies that the environment variables required by the data layer are
 * present, and prints the recommended next steps for bringing up the database.
 * Does NOT install anything or mutate any infrastructure.
 *
 * Usage:
 *   tsx scripts/setup-local.ts
 */

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const ENV_VARS: EnvVar[] = [
  {
    name: 'SUPABASE_URL',
    required: false,
    description: 'Supabase project URL (or NEXT_PUBLIC_SUPABASE_URL).'
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    required: false,
    description: 'Public Supabase URL exposed to the browser client.'
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    required: false,
    description: 'Public anon key for the RLS-enforced browser client.'
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    required: true,
    description: 'Service-role key (server-only) used by the seed script. NEVER expose to the client.'
  },
  {
    name: 'DATABASE_URL',
    required: true,
    description: 'Pooled Postgres connection string (Prisma + psql SQL seed).'
  },
  {
    name: 'DIRECT_URL',
    required: false,
    description: 'Direct (non-pooled) Postgres URL used by Prisma migrations.'
  }
];

function isSet(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

function main() {
  console.log('HSI local setup check\n=====================');

  // A URL is satisfied by either the public or the server variable.
  const hasUrl = isSet('SUPABASE_URL') || isSet('NEXT_PUBLIC_SUPABASE_URL');
  const hasAnon = isSet('NEXT_PUBLIC_SUPABASE_ANON_KEY') || isSet('SUPABASE_ANON_KEY');

  const missing: string[] = [];

  for (const v of ENV_VARS) {
    const present = isSet(v.name);
    const status = present ? 'OK ' : v.required ? 'MISSING' : '--';
    console.log(`[${status}] ${v.name} — ${v.description}`);
    if (v.required && !present) missing.push(v.name);
  }

  console.log('\nDerived checks:');
  console.log(`[${hasUrl ? 'OK ' : 'MISSING'}] A Supabase URL is configured.`);
  console.log(`[${hasAnon ? 'OK ' : '--'}] An anon key is configured (needed for the browser client).`);

  if (!hasUrl) missing.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');

  if (missing.length > 0) {
    console.error(
      `\nMissing required configuration: ${missing.join(', ')}.\n` +
        'Create a .env at the repo root with these values before continuing.'
    );
    process.exit(1);
  }

  console.log('\nAll required environment variables are present.');
  console.log('\nNext steps:');
  console.log('  1. Apply migrations (in order) to your Supabase project:');
  console.log('       supabase/migrations/0001_init.sql');
  console.log('       supabase/migrations/0002_rls_and_policies.sql');
  console.log('       supabase/migrations/0003_indexes_constraints.sql');
  console.log('       supabase/migrations/0004_storage_buckets.sql');
  console.log('     e.g. `supabase db push` or `psql "$DATABASE_URL" -f <file>`.');
  console.log('  2. Generate the Prisma client: `pnpm --filter @hsi/database db:generate`.');
  console.log('  3. Seed roles + taxonomy: `pnpm seed` (add `--with-sql` for sample data).');
  console.log('  4. In Supabase: enable Auth, and link app `users.id` to `auth.uid()`.');
  console.log('  5. Confirm Storage buckets exist: evidence, uploads, public-report-assets.');
}

main();

/**
 * Human Signal Index — seed script.
 *
 * Idempotently upserts the base roles and the 36-category taxonomy using the
 * Supabase SERVICE-ROLE client (bypasses RLS — server-side only). The category
 * list and roles come from the shared-types single source of truth.
 *
 * Optionally also applies the full SQL seed file (sources, signals, sample
 * classifications + risk_scores) when run with `--with-sql` (requires `psql`
 * and DATABASE_URL).
 *
 * Usage:
 *   tsx scripts/seed.ts            # upsert roles + taxonomy via Supabase
 *   tsx scripts/seed.ts --with-sql # also run supabase/seed/seed-data.sql
 *
 * Required env:
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   DATABASE_URL (only when using --with-sql)
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { createServiceRoleClient } from '../packages/database/src/supabaseClient';
import { CATEGORY_TAXONOMY, HSI_ROLES } from '../packages/shared-types/src/index';

async function seedRoles(client: ReturnType<typeof createServiceRoleClient>) {
  const rows = HSI_ROLES.map((r) => ({ name: r.name, description: r.description }));
  const { error } = await client.from('roles').upsert(rows, { onConflict: 'name' });
  if (error) throw new Error(`Failed to seed roles: ${error.message}`);
  console.log(`Seeded ${rows.length} roles.`);
}

async function seedTaxonomy(client: ReturnType<typeof createServiceRoleClient>) {
  const rows = CATEGORY_TAXONOMY.map((c) => ({
    slug: c.slug,
    title: c.title,
    description: c.description
  }));
  const { error } = await client
    .from('category_taxonomy')
    .upsert(rows, { onConflict: 'slug' });
  if (error) throw new Error(`Failed to seed category_taxonomy: ${error.message}`);
  console.log(`Seeded ${rows.length} taxonomy categories.`);
}

function applySqlSeed() {
  const seedPath = join(process.cwd(), 'supabase', 'seed', 'seed-data.sql');
  if (!existsSync(seedPath)) {
    throw new Error(`Seed SQL file not found at ${seedPath}`);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run the SQL seed (--with-sql).');
  }
  console.log('Applying SQL seed via psql...');
  execSync(`psql "${databaseUrl}" -f "${seedPath}"`, { stdio: 'inherit' });
  console.log('SQL seed applied.');
}

async function main() {
  const withSql = process.argv.includes('--with-sql');

  const client = createServiceRoleClient();
  console.log('Seeding via Supabase service-role client...');
  await seedRoles(client);
  await seedTaxonomy(client);

  if (withSql) {
    applySqlSeed();
  } else {
    console.log('Tip: pass --with-sql to also seed sample sources/signals.');
  }

  console.log('Seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

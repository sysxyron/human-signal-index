// =============================================================================
// HSI Phase 23 — production smoke test.
//
// Verifies the platform is structurally launch-ready WITHOUT needing a database:
//   * Migration files 0001→0026 present and match the committed EXPECTED set
//   * Route registry integrity (every ROUTES value resolves to a page on disk)
//   * Sidebar navigation targets all resolve (no broken menu targets)
//   * RBAC protected-route map loads and references real routes
//   * Required environment variables present (WARN if absent — CI-friendly)
//
// Optional LIVE checks (when SMOKE_BASE_URL is set): homepage 200, dashboard
// redirect to /sign-in, health endpoints.
//
// Output: one PASS / WARNING / FAIL line per check. Exits 1 if any check FAILs.
// Run from the repo root:  pnpm tsx scripts/production-smoke-test.ts
// =============================================================================

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { EXPECTED_MIGRATIONS } from '../apps/web/lib/launch/migration-audit';
import { ROUTES, REDIRECT_ROUTES } from '../apps/web/lib/navigation/routes';
import { PROTECTED_ROUTES } from '../apps/web/lib/security/rbac-audit';

const ROOT = process.cwd();
const APP_DIR = resolve(ROOT, 'apps/web/app');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const NAV_FILE = resolve(ROOT, 'packages/ui/src/navigation.tsx');

type Level = 'PASS' | 'WARNING' | 'FAIL';
const results: { level: Level; name: string; detail: string }[] = [];
const record = (level: Level, name: string, detail: string) => results.push({ level, name, detail });

// ---- route set from disk --------------------------------------------------
function findPages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findPages(full, acc);
    else if (entry === 'page.tsx' || entry === 'page.ts') acc.push(full);
  }
  return acc;
}
function toRoute(pageFile: string): string {
  const rel = pageFile.slice(APP_DIR.length).split(sep).filter(Boolean);
  rel.pop();
  const segments = rel.filter((s) => !(s.startsWith('(') && s.endsWith(')')));
  return '/' + segments.join('/');
}
function buildRouteSets() {
  const staticRoutes = new Set<string>(['/']);
  const dynamicRoutes: string[][] = [];
  for (const p of findPages(APP_DIR)) {
    const r = toRoute(p) || '/';
    if (r.includes('[')) dynamicRoutes.push(r.split('/').filter(Boolean));
    else staticRoutes.add(r);
  }
  return { staticRoutes, dynamicRoutes };
}
function resolves(target: string, staticRoutes: Set<string>, dynamicRoutes: string[][]): boolean {
  const clean = target.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
  if (staticRoutes.has(clean)) return true;
  const parts = clean.split('/').filter(Boolean);
  return dynamicRoutes.some(
    (pat) => pat.length === parts.length && pat.every((s, i) => (s.startsWith('[') && s.endsWith(']')) || s === parts[i]),
  );
}

// ---- 1. migrations --------------------------------------------------------
function checkMigrations() {
  let files: string[] = [];
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  } catch {
    record('FAIL', 'Migrations', 'supabase/migrations directory not found.');
    return;
  }
  const fileIds = new Set(files.map((f) => /(\d{4})/.exec(f)?.[1]).filter(Boolean) as string[]);
  const missing = EXPECTED_MIGRATIONS.filter((m) => !fileIds.has(m.id));
  const extra = [...fileIds].filter((id) => !EXPECTED_MIGRATIONS.some((m) => m.id === id));
  if (missing.length > 0) {
    record('FAIL', 'Migrations', `EXPECTED migrations missing on disk: ${missing.map((m) => m.id).join(', ')}.`);
  } else if (extra.length > 0) {
    record('WARNING', 'Migrations', `Extra migration files not in EXPECTED set: ${extra.join(', ')} (update EXPECTED_MIGRATIONS).`);
  } else {
    record('PASS', 'Migrations', `All ${EXPECTED_MIGRATIONS.length} expected migrations present (0001→0026).`);
  }
}

// ---- 2. route registry integrity -----------------------------------------
function checkRouteRegistry(sets: ReturnType<typeof buildRouteSets>) {
  const redirects = new Set(REDIRECT_ROUTES);
  const broken: string[] = [];
  for (const [key, target] of Object.entries(ROUTES)) {
    if (redirects.has(target)) continue;
    if (!resolves(target, sets.staticRoutes, sets.dynamicRoutes)) broken.push(`${key}→${target}`);
  }
  if (broken.length > 0) record('FAIL', 'Route registry', `Unresolved routes: ${broken.join(', ')}.`);
  else record('PASS', 'Route registry', `All ${Object.keys(ROUTES).length} registered routes resolve.`);
}

// ---- 3. sidebar navigation targets ---------------------------------------
function checkSidebar(sets: ReturnType<typeof buildRouteSets>) {
  let src = '';
  try {
    src = readFileSync(NAV_FILE, 'utf8');
  } catch {
    record('FAIL', 'Navigation targets', 'navigation.tsx not found.');
    return;
  }
  const start = src.indexOf('dashboardNavGroups');
  const end = src.indexOf('export function DashboardSidebar');
  const block = start >= 0 && end > start ? src.slice(start, end) : src;
  const hrefs: string[] = [];
  const re = /href:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) hrefs.push(m[1]);
  const broken = hrefs.filter((h) => !resolves(h, sets.staticRoutes, sets.dynamicRoutes));
  if (broken.length > 0) record('FAIL', 'Navigation targets', `Broken sidebar hrefs: ${broken.join(', ')}.`);
  else record('PASS', 'Navigation targets', `All ${hrefs.length} sidebar links resolve.`);
}

// ---- 4. RBAC map integrity ------------------------------------------------
function checkRbac(sets: ReturnType<typeof buildRouteSets>) {
  if (!Array.isArray(PROTECTED_ROUTES) || PROTECTED_ROUTES.length === 0) {
    record('FAIL', 'RBAC map', 'PROTECTED_ROUTES is empty or did not load.');
    return;
  }
  const bad = PROTECTED_ROUTES.filter((r) => !resolves(r.pattern, sets.staticRoutes, sets.dynamicRoutes));
  // Patterns are prefixes; some (e.g. /dashboard/admin, /dashboard/decisions) may
  // be prefixes rather than exact pages — only flag ones with no resolving page
  // AND no page underneath them.
  const trulyBad = bad.filter((r) => ![...sets.staticRoutes].some((s) => s.startsWith(r.pattern)));
  if (trulyBad.length > 0) {
    record('WARNING', 'RBAC map', `Protected patterns with no matching page: ${trulyBad.map((r) => r.pattern).join(', ')}.`);
  } else {
    record('PASS', 'RBAC map', `${PROTECTED_ROUTES.length} protected-route rules load and reference real routes.`);
  }
}

// ---- 5. required env ------------------------------------------------------
function checkEnv() {
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const missing = required.filter((k) => !process.env[k] || process.env[k]!.trim() === '');
  if (missing.length === required.length) {
    record('WARNING', 'Environment', `No Supabase env in this shell (${missing.join(', ')}) — fine for static CI; set them in the deploy.`);
  } else if (missing.length > 0) {
    record('FAIL', 'Environment', `Some required env present but missing: ${missing.join(', ')}.`);
  } else {
    record('PASS', 'Environment', 'Required Supabase env present.');
  }
  if (!process.env.NEXT_PUBLIC_APP_URL) record('WARNING', 'App URL', 'NEXT_PUBLIC_APP_URL not set in this shell.');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) record('WARNING', 'Worker creds', 'SUPABASE_SERVICE_ROLE_KEY not set — workers/cron run offline.');
}

// ---- 6. optional live checks ---------------------------------------------
async function checkLive() {
  const base = process.env.SMOKE_BASE_URL;
  if (!base) {
    record('WARNING', 'Live checks', 'SMOKE_BASE_URL not set — skipped homepage/redirect/health probes.');
    return;
  }
  const get = async (path: string, redirect: 'follow' | 'manual' = 'manual') => {
    try {
      const res = await fetch(`${base}${path}`, { redirect });
      return res.status;
    } catch (e) {
      return -1;
    }
  };
  const home = await get('/', 'follow');
  record(home === 200 ? 'PASS' : 'FAIL', 'Live: homepage', `GET / → ${home}`);
  const dash = await get('/dashboard');
  record(dash === 307 || dash === 302 ? 'PASS' : dash === 200 ? 'WARNING' : 'FAIL', 'Live: dashboard redirect', `GET /dashboard → ${dash} (expect 307 → sign-in when signed out)`);
  for (const svc of ['supabase', 'auth', 'rest', 'storage']) {
    const code = await get(`/api/health/${svc}`, 'follow');
    record(code === 200 ? 'PASS' : code === 503 ? 'WARNING' : 'FAIL', `Live: health/${svc}`, `→ ${code}`);
  }
}

// ---- run ------------------------------------------------------------------
async function main() {
  const sets = buildRouteSets();
  checkMigrations();
  checkRouteRegistry(sets);
  checkSidebar(sets);
  checkRbac(sets);
  checkEnv();
  await checkLive();

  const icon = (l: Level) => (l === 'PASS' ? '✓ PASS   ' : l === 'WARNING' ? '⚠ WARNING' : '✗ FAIL   ');
  // eslint-disable-next-line no-console
  console.log('\nHSI Production Smoke Test\n' + '='.repeat(60));
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(`${icon(r.level)}  ${r.name.padEnd(22)} ${r.detail}`);
  }
  const fails = results.filter((r) => r.level === 'FAIL').length;
  const warns = results.filter((r) => r.level === 'WARNING').length;
  // eslint-disable-next-line no-console
  console.log('='.repeat(60));
  // eslint-disable-next-line no-console
  console.log(`${results.length} checks · ${results.length - fails - warns} pass · ${warns} warning · ${fails} fail`);
  if (fails > 0) {
    // eslint-disable-next-line no-console
    console.error('\n✗ SMOKE TEST FAILED');
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('\n✓ SMOKE TEST PASSED' + (warns > 0 ? ` (with ${warns} warning(s))` : ''));
}

void main();

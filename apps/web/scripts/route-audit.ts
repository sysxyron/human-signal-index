// =============================================================================
// HSI — route audit (Post-V1 navigation audit, Task 7).
//
// Verifies that every route the app links to actually resolves to a page on disk:
//   1. Scans apps/web/app/**/page.tsx and normalises each to a route path
//      (route-group segments like "(marketing)" are stripped; "[param]" dynamic
//      segments are kept as patterns).
//   2. Checks every value in the central ROUTES registry resolves.
//   3. Checks every href in the dashboard sidebar (packages/ui navigation.tsx)
//      resolves.
//
// Prints "✓ Route exists" / "✗ Missing route" per entry and exits non-zero if any
// link is broken — so CI fails on a dead navigation target.
//
// Run from the repo root:  npx tsx apps/web/scripts/route-audit.ts
// =============================================================================

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { ROUTES, REDIRECT_ROUTES } from '../lib/navigation/routes';

const ROOT = process.cwd();
const APP_DIR = resolve(ROOT, 'apps/web/app');
const NAV_FILE = resolve(ROOT, 'packages/ui/src/navigation.tsx');

/** Recursively collect every page.tsx under the app directory. */
function findPages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findPages(full, acc);
    else if (entry === 'page.tsx' || entry === 'page.ts') acc.push(full);
  }
  return acc;
}

/** Convert an absolute page.tsx path into its route path. */
function toRoute(pageFile: string): string {
  const rel = pageFile.slice(APP_DIR.length).split(sep).filter(Boolean);
  rel.pop(); // drop page.tsx
  const segments = rel.filter((s) => !(s.startsWith('(') && s.endsWith(')'))); // drop route groups
  return '/' + segments.join('/');
}

/** Does `target` resolve against the set of real routes (incl. dynamic segments)? */
function resolves(target: string, staticRoutes: Set<string>, dynamicRoutes: string[][]): boolean {
  const clean = target.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
  if (staticRoutes.has(clean)) return true;
  const parts = clean.split('/').filter(Boolean);
  for (const pattern of dynamicRoutes) {
    if (pattern.length !== parts.length) continue;
    if (pattern.every((seg, i) => (seg.startsWith('[') && seg.endsWith(']')) || seg === parts[i])) return true;
  }
  return false;
}

/** Extract dashboard sidebar hrefs from navigation.tsx (the dashboardNavGroups block). */
function sidebarHrefs(): string[] {
  if (!existsSync(NAV_FILE)) return [];
  const src = readFileSync(NAV_FILE, 'utf8');
  const start = src.indexOf('dashboardNavGroups');
  const end = src.indexOf('export function DashboardSidebar');
  const block = start >= 0 && end > start ? src.slice(start, end) : src;
  const hrefs: string[] = [];
  const re = /href:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) hrefs.push(m[1]);
  return hrefs;
}

function main(): void {
  const pages = findPages(APP_DIR);
  const staticRoutes = new Set<string>();
  const dynamicRoutes: string[][] = [];
  for (const p of pages) {
    const route = toRoute(p);
    if (route.includes('[')) dynamicRoutes.push(route.split('/').filter(Boolean));
    else staticRoutes.add(route === '' ? '/' : route);
  }
  staticRoutes.add('/');

  const redirects = new Set(REDIRECT_ROUTES);
  let failures = 0;
  const lines: string[] = [];

  // 1. Registry.
  lines.push('Route registry (ROUTES):');
  for (const [key, target] of Object.entries(ROUTES)) {
    if (redirects.has(target)) {
      lines.push(`  ↻ ${key} → ${target} (redirect/alias — skipped)`);
      continue;
    }
    if (resolves(target, staticRoutes, dynamicRoutes)) {
      lines.push(`  ✓ Route exists   ${key} → ${target}`);
    } else {
      lines.push(`  ✗ Missing route  ${key} → ${target}`);
      failures++;
    }
  }

  // 2. Sidebar.
  lines.push('');
  lines.push('Dashboard sidebar hrefs:');
  for (const href of sidebarHrefs()) {
    if (resolves(href, staticRoutes, dynamicRoutes)) {
      lines.push(`  ✓ Route exists   ${href}`);
    } else {
      lines.push(`  ✗ Missing route  ${href}`);
      failures++;
    }
  }

  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
  // eslint-disable-next-line no-console
  console.log(
    `\nScanned ${pages.length} pages · ${staticRoutes.size} static routes · ${dynamicRoutes.length} dynamic routes`,
  );

  if (failures > 0) {
    // eslint-disable-next-line no-console
    console.error(`\n✗ Route audit failed: ${failures} missing route(s).`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('\n✓ Route audit passed: every registered + sidebar route resolves.');
}

main();

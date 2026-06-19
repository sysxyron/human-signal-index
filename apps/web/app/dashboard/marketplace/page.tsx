// =============================================================================
// HSI Phase 69 — Marketplace administration (/dashboard/marketplace). Server
// Component, force-dynamic, ADMIN-ONLY. Publish products (packaging existing
// intelligence), feature / archive / version. All actions audited. The public
// catalog lives at /marketplace.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import { SafeActionButton } from '@/components/navigation/SafeActionButton';
import { getAdminProducts } from '@/lib/marketplace/service';
import { PublishProductForm, ProductAdminRow } from '@/components/marketplace/AdminManager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MarketplaceAdminPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Marketplace" subtitle="Marketplace administration" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Marketplace administration is available to administrators.' : 'Sign in to manage the marketplace.'} redirectedFrom="/dashboard/marketplace" />
        </main>
      </>
    );
  }

  const res = await getAdminProducts();
  const products = res.ok ? res.data : [];

  return (
    <DashboardPage
      title="Marketplace Administration"
      subtitle="Publish, feature, version, and archive intelligence products. The marketplace distributes existing intelligence — it never generates it."
      actions={<SafeActionButton variant="secondary" href="/marketplace">View public catalog</SafeActionButton>}
    >
      <div className="space-y-8">
        <PublishProductForm />
        <div className="space-y-3">
          <h2 className="text-h6 font-semibold text-text-primary">All products ({products.length})</h2>
          {products.length === 0 ? (
            <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-8 text-center text-caption text-text-muted">No products yet. Publish one above.</p>
          ) : (
            <ul className="space-y-1.5">{products.map((p) => <ProductAdminRow key={p.id} product={p} />)}</ul>
          )}
        </div>
      </div>
    </DashboardPage>
  );
}

import { DashboardPage } from '../../../components/dashboard-shell';
import { SafeActionButton } from '@/components/navigation/SafeActionButton';
import { ROUTES } from '@/lib/navigation/routes';
import { getSourceIntelligence } from '@/lib/source-intelligence';
import { SourceHealthDashboard } from '@/components/source-registry/SourceHealthDashboard';
import { CoverageMap } from '@/components/source-registry/CoverageMap';
import { SourceAnalytics } from '@/components/source-registry/SourceAnalytics';
import { SourceExplorer } from '@/components/source-registry/SourceExplorer';

export default async function SourceRegistryPage() {
  const data = await getSourceIntelligence();

  return (
    <DashboardPage
      title="Source Registry"
      subtitle="Source-intelligence observatory — where intelligence comes from, what's active, and what's producing signals"
      actions={<SafeActionButton variant="primary" href={ROUTES.sources}>Manage sources</SafeActionButton>}
    >
      <div className="space-y-8">
        {/* Part 3 — health dashboard */}
        <SourceHealthDashboard health={data.health} />

        {/* Part 4 + Part 8 — coverage + analytics */}
        <CoverageMap coverage={data.coverage} />
        <SourceAnalytics analytics={data.analytics} />

        {/* Parts 1, 2, 5, 6, 7 — explorer + on-demand detail */}
        <div className="space-y-4">
          <h2 className="text-h6 font-semibold text-text-primary">Source explorer</h2>
          <SourceExplorer sources={data.sources} />
        </div>
      </div>
    </DashboardPage>
  );
}

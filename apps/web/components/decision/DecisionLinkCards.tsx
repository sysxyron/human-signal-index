// =============================================================================
// HSI Phase 13 — Decision link cards (ADDITIVE) for the Intelligence dashboard
// and the Simulation dashboard. Server-safe presentational link cards matching
// the existing IntelLinkCards / SimulationLinkCard aesthetic.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { Target, Network, Swords, ArrowRight, type LucideIcon } from 'lucide-react';

function LinkCard({
  href,
  title,
  subtitle,
  icon: Icon,
  accent,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <Link href={href as never} className="block">
      <Card className="flex items-center gap-3" interactive padded>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}26`, color: accent }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-h6 font-semibold text-text-primary">{title}</p>
          <p className="text-caption text-text-muted">{subtitle}</p>
        </div>
        <ArrowRight className="ml-auto h-4 w-4 text-text-muted" />
      </Card>
    </Link>
  );
}

export function DecisionsLinkCard() {
  return (
    <LinkCard
      href="/dashboard/intelligence/decisions"
      title="Decision intelligence"
      subtitle="What should we do next? — recommendations, ranked interventions + audit"
      icon={Target}
      accent="#10B981"
    />
  );
}

export function CrossImpactsLinkCard() {
  return (
    <LinkCard
      href="/dashboard/intelligence/impacts"
      title="Cross-narrative impacts"
      subtitle="How one narrative amplifies, dampens, or competes with another"
      icon={Network}
      accent="#06B6D4"
    />
  );
}

export function ScenarioBattleLinkCard() {
  return (
    <LinkCard
      href="/dashboard/simulation/compare"
      title="Scenario battle / compare"
      subtitle="War-game Scenario A vs Scenario B — head-to-head with a clear winner"
      icon={Swords}
      accent="#8B5CF6"
    />
  );
}

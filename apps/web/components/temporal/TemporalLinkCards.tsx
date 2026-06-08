// =============================================================================
// HSI Phase 10 — Temporal Intelligence link cards (ADDITIVE) for the Intelligence
// dashboard: Evolution / Genealogy / Influence / Forecast. Server-safe
// presentational link cards matching the existing IntelLinkCards aesthetic.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { History, GitBranch, Zap, LineChart, ArrowRight } from 'lucide-react';
import { type ComponentType } from 'react';
import { type LucideProps } from 'lucide-react';

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
  icon: ComponentType<LucideProps>;
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

export function EvolutionLinkCard() {
  return (
    <LinkCard
      href="/dashboard/intelligence/evolution"
      title="Narrative evolution"
      subtitle="How narratives grow, decline & mutate over time"
      icon={History}
      accent="#10B981"
    />
  );
}

export function GenealogyLinkCard() {
  return (
    <LinkCard
      href="/dashboard/intelligence/genealogy"
      title="Narrative genealogy"
      subtitle="Lineage: derived / split / merged / contradicts"
      icon={GitBranch}
      accent="#3B82F6"
    />
  );
}

export function InfluenceLinkCard() {
  return (
    <LinkCard
      href="/dashboard/intelligence/influence"
      title="Narrative influence"
      subtitle="Directed, weighted cross-narrative influence"
      icon={Zap}
      accent="#06B6D4"
    />
  );
}

export function ForecastLinkCard() {
  return (
    <LinkCard
      href="/dashboard/intelligence/forecast"
      title="Narrative forecasts"
      subtitle="Probabilistic trajectory forecasts (not certainties)"
      icon={LineChart}
      accent="#8B5CF6"
    />
  );
}

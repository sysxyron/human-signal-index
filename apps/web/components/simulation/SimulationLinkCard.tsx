// =============================================================================
// HSI Phase 12 — Simulation link cards (ADDITIVE) for the Intelligence dashboard
// and the WorldForge fusion page. Server-safe presentational link cards matching
// the existing Causal/Temporal IntelLinkCards aesthetic.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { FlaskConical, Globe2, ArrowRight, type LucideIcon } from 'lucide-react';

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

export function SimulationLinkCard() {
  return (
    <LinkCard
      href="/dashboard/simulation"
      title="Counterfactual simulation"
      subtitle="What if X never happened? — grounded estimates + forecast calibration"
      icon={FlaskConical}
      accent="#8B5CF6"
    />
  );
}

export function WorldforgeScenariosLinkCard() {
  return (
    <LinkCard
      href="/dashboard/worldforge/scenarios/counterfactual"
      title="WorldForge scenarios"
      subtitle="Alternative timelines materialized from counterfactual runs"
      icon={Globe2}
      accent="#06B6D4"
    />
  );
}

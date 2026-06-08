// =============================================================================
// HSI Phase 11 — Causal Intelligence link cards (ADDITIVE) for the Intelligence
// dashboard: Causal Intelligence + Narrative Replay. Server-safe presentational
// link cards matching the existing Temporal/IntelLinkCards aesthetic.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { GitBranch, Clapperboard, ArrowRight, type LucideIcon } from 'lucide-react';

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

export function CausalLinkCard() {
  return (
    <LinkCard
      href="/dashboard/intelligence/causal"
      title="Causal intelligence"
      subtitle="Why narratives moved — events, chains & explanations"
      icon={GitBranch}
      accent="#8B5CF6"
    />
  );
}

export function ReplayLinkCard() {
  return (
    <LinkCard
      href="/dashboard/intelligence/replay"
      title="Narrative replay"
      subtitle="Scrub a narrative's history frame by frame"
      icon={Clapperboard}
      accent="#06B6D4"
    />
  );
}

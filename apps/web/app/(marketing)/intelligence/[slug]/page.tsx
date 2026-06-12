// =============================================================================
// HSI Phase 19 — Public Publication page (/intelligence/[slug]). PUBLIC,
// force-dynamic. getPublicationBySlugAction(slug) returns the published report:
// the 12 explainable sections, the open trust surface (+ history), the source
// references, the full audit trail (who approved it), and — if retracted — the
// always-visible retraction notice. Answers "why should I trust this?", "what
// changed?", "what evidence supports this?", "who approved publication?".
//
// Offline (NOT_CONFIGURED) → labeled demo. Anonymous-accessible.
// =============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@hsi/ui';
import { ArrowLeft, FileCheck2, History } from 'lucide-react';
import type { PublicationPageData } from '@hsi/shared-types';
import { getPublicationBySlugAction } from '@/lib/publishing/actions';
import { demoPublicationPage } from '@/lib/publishing/view';
import { Section } from '../../../../components/page-header';
import { PublicationStateBadge } from '@/components/publishing/badges';
import {
  PublicationTrustSurface,
  ReportSections,
  RetractionNotice,
} from '@/components/publishing/ReportSections';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PublicationPage({ params }: { params: { slug: string } }) {
  const res = await getPublicationBySlugAction(params.slug);

  let data: PublicationPageData | null = null;
  let isDemo = false;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') {
    data = demoPublicationPage(params.slug);
    isDemo = true;
  } else if (res.code === 'DB_ERROR') {
    // not found
    notFound();
  }

  if (!data) notFound();
  const pub = data.publication;

  return (
    <Section>
      <Link href={'/intelligence' as never} className="mb-4 inline-flex items-center gap-1.5 text-caption text-text-secondary hover:text-text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> All intelligence
      </Link>

      {isDemo ? (
        <p className="mb-4 rounded-card border border-warning/40 bg-warning/5 px-3 py-2 text-caption text-warning">
          Showing demo content — connect Supabase to surface the live report.
        </p>
      ) : null}

      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-h3 font-bold tracking-tight text-text-primary lg:text-h2">{pub.title}</h1>
          <PublicationStateBadge state={pub.state} />
        </div>
        <p className="text-body-lg text-text-secondary">{pub.summary}</p>
      </div>

      {data.retraction ? <div className="mb-6"><RetractionNotice retraction={data.retraction} /></div> : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <ReportSections sections={data.report} />
        </div>
        <div className="space-y-4">
          <PublicationTrustSurface publication={pub} trustHistory={data.trustHistory} />

          {data.sourceRefs.length > 0 ? (
            <Card className="space-y-2 border-border" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <FileCheck2 className="h-4 w-4 text-electric" /> Source references
              </h3>
              <ul className="ml-4 list-disc space-y-0.5 text-[12px] text-text-secondary">
                {data.sourceRefs.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Card>
          ) : null}

          <Card className="space-y-2 border-border" padded>
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
              <History className="h-4 w-4 text-electric" /> Audit trail
            </h3>
            <ul className="space-y-1 text-[11px] leading-snug text-text-muted">
              {data.auditTrail.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </Card>
        </div>
      </div>
    </Section>
  );
}

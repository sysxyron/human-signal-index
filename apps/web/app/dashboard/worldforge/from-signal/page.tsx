// =============================================================================
// HSI Phase 9 — WorldForge Fusion (/dashboard/worldforge/from-signal). Server
// Component, force-dynamic. Reads ?signalId=. When present, drafts a fusion via
// draftWorldforgeFromSignalAction(signalId) → editable title + prompt + rationale;
// a researcher Approves → approveWorldforgeFusionAction → links to the created
// research run. Also lists existing links (listWorldforgeLinksAction). No signalId
// → an explainer + a link to pick a signal. NEVER auto-publishes.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { GitMerge, Info, Inbox, ArrowRight } from 'lucide-react';
import type {
  HsinWorldforgeLinkRecord,
  WorldforgeFusionDraft,
} from '@hsi/shared-types';
import {
  draftWorldforgeFromSignalAction,
  listWorldforgeLinksAction,
} from '@/lib/operations/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  canResearch,
  demoFusionDraft,
  demoWorldforgeLinks,
} from '@/lib/operations/phase9-view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';
import { FusionDraftCard } from '@/components/fusion/FusionDraftCard';
import { WorldforgeLinkList } from '@/components/fusion/WorldforgeLinkList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const FLOW =
  'Signal → narrative → research prompt → approve → research run → evidence / consensus / governance. ' +
  'The network never auto-publishes: approving only spawns a research run for human-driven review.';

export default async function FromSignalPage({
  searchParams,
}: {
  searchParams: { signalId?: string };
}) {
  const signalId = searchParams.signalId?.trim() || undefined;

  const [role, user, linksRes] = await Promise.all([
    getSessionRole(),
    getUser(),
    listWorldforgeLinksAction(),
  ]);
  const canApprove = canResearch(role) && Boolean(user);

  // Resolve the existing links (used for both the configured + demo paths).
  let links: HsinWorldforgeLinkRecord[] = [];
  let linksDemo = false;
  if (linksRes.ok) {
    links = linksRes.data;
  } else if (linksRes.code === 'NOT_CONFIGURED') {
    links = demoWorldforgeLinks();
    linksDemo = true;
  }

  // Draft a fusion only when a signal is provided.
  let draft: WorldforgeFusionDraft | null = null;
  let draftDemo = false;
  let draftErr: { message: string; code?: DbErrorCode } | null = null;
  if (signalId) {
    const res = await draftWorldforgeFromSignalAction(signalId);
    if (res.ok) {
      draft = res.data;
    } else if (res.code === 'NOT_CONFIGURED') {
      draft = demoFusionDraft(signalId);
      draftDemo = true;
    } else {
      draftErr = { message: res.error, code: res.code };
    }
  }

  const isDemo = draftDemo || (linksDemo && !signalId);

  return (
    <>
      <TopNav title="WorldForge Fusion" subtitle="Turn a signal into a research run" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <GitMerge className="h-5 w-5 text-electric" /> WorldForge fusion
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <Link
            href={'/dashboard/signals' as never}
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
          >
            <Inbox className="h-3.5 w-3.5" /> Pick a signal
          </Link>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="space-y-2 border-electric/30 bg-electric/5" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-electric">
            <Info className="h-4 w-4" /> How fusion works
          </h3>
          <p className="text-caption leading-relaxed text-text-secondary">{FLOW}</p>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {!signalId ? (
              <Card className="space-y-3" padded>
                <h3 className="text-h6 font-semibold text-text-primary">Start from a signal</h3>
                <p className="text-body-sm leading-relaxed text-text-secondary">
                  Fusion drafts a neutral research prompt from a captured public signal and the
                  narrative it belongs to. Open any signal and choose{' '}
                  <span className="font-semibold text-text-primary">“Draft WorldForge prompt”</span>,
                  or pick one now.
                </p>
                <Link
                  href={'/dashboard/signals' as never}
                  className="inline-flex w-fit items-center gap-2 rounded-btn border border-electric/40 bg-electric/10 px-3.5 py-2 text-caption font-semibold text-electric transition hover:border-electric hover:text-white"
                >
                  Browse signals <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Card>
            ) : draftErr ? (
              <ErrorState
                title="Could not draft a fusion from this signal"
                message={draftErr.message}
                code={draftErr.code}
                redirectedFrom={`/dashboard/worldforge/from-signal?signalId=${encodeURIComponent(signalId)}`}
              />
            ) : draft ? (
              <FusionDraftCard draft={draft} canApprove={canApprove} demo={draftDemo} />
            ) : null}
          </div>

          <div className="space-y-6">
            <WorldforgeLinkList links={links} />
          </div>
        </div>
      </main>
    </>
  );
}

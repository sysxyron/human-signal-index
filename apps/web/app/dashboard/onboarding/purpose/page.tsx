// =============================================================================
// HSI Phase 25 — Purpose onboarding (/dashboard/onboarding/purpose). Server
// Component. Any signed-in user. After signup/first login, asks "What brings you
// to Human Signal Index?". The default role stays VIEWER — no privileged role is
// granted automatically. Non-observer paths create an admin-reviewed application.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Compass, ShieldCheck } from 'lucide-react';
import { PURPOSE_OPTIONS } from '@/lib/contributor/options';
import { PurposeForm } from '@/components/contributor/PurposeForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function PurposeOnboardingPage() {
  return (
    <>
      <TopNav title="Welcome to Human Signal Index" subtitle="What brings you here?" />
      <main className="mx-auto max-w-3xl space-y-6 p-5 lg:p-6">
        <Card className="flex items-start gap-3 border-electric/30 bg-electric/5" padded>
          <Compass className="mt-0.5 h-5 w-5 shrink-0 text-electric" />
          <div>
            <h2 className="text-h5 font-semibold text-text-primary">Choose your purpose</h2>
            <p className="mt-1 text-caption text-text-secondary">Everyone starts as a <strong className="text-text-primary">Viewer</strong>. Pick how you want to contribute — privileged roles are earned through reviewed work and granted by an administrator, never selected directly.</p>
          </div>
        </Card>

        <PurposeForm options={PURPOSE_OPTIONS} />

        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
          <p className="text-label text-text-muted">Submitting an application does not change your access. You keep Viewer permissions until an administrator approves a role. Admin roles are never available through this flow.</p>
        </Card>
      </main>
    </>
  );
}

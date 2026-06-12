// =============================================================================
// HSI Phase 19 — Subscribe (/subscribe). PUBLIC page, force-dynamic. Lets a
// signed-in visitor subscribe with a tier, digest cadence, topic + channel
// preferences. The server gates on sign-in. Anonymous visitors are prompted to
// sign in. Distribution is opt-in; nothing is sent without a subscription.
// =============================================================================

import { PageHeader, Section } from '../../../components/page-header';
import { Card } from '@hsi/ui';
import { Bell } from 'lucide-react';
import { subscribeAction, unsubscribeAction, getSubscriptionAccountAction } from '@/lib/publishing/actions';
import { getUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Subscribe' };

import { SubscribeForm } from '@/components/publishing/SubscribeForm';

export default async function SubscribePage() {
  const user = await getUser();
  const signedIn = Boolean(user);
  let currentEmail: string | undefined;
  let currentActive = false;
  if (signedIn) {
    const res = await getSubscriptionAccountAction();
    if (res.ok && res.data.subscriber) {
      currentEmail = res.data.subscriber.email;
      currentActive = res.data.subscriber.active === true;
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Subscribe"
        title="Get the intelligence digest"
        description="Receive trust-aware, evidence-backed reports — daily or weekly, by topic. Every digest entry references its source; you can unsubscribe anytime."
      />
      <Section>
        <Card className="max-w-2xl space-y-4 border-border" padded>
          <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <Bell className="h-4 w-4 text-electric" /> Subscription preferences
          </h2>
          <SubscribeForm
            subscribeAction={subscribeAction}
            unsubscribeAction={unsubscribeAction}
            signedIn={signedIn}
            currentEmail={currentEmail}
            currentActive={currentActive}
          />
        </Card>
      </Section>
    </>
  );
}

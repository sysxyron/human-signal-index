// =============================================================================
// HSI Phase 19 — Account Subscriptions (/account/subscriptions). force-dynamic.
// getSubscriptionAccountAction() returns the signed-in user's subscriber row,
// preferences, and recent digests. Sign-in required (server-gated).
// =============================================================================

import { PageHeader, Section } from '../../../../components/page-header';
import { Card } from '@hsi/ui';
import { Mail, Settings } from 'lucide-react';
import type { SubscriptionAccountData } from '@hsi/shared-types';
import { getSubscriptionAccountAction, subscribeAction, unsubscribeAction } from '@/lib/publishing/actions';
import { getUser } from '@/lib/supabase/server';
import { demoSubscriptionAccount, formatDate, readStringArray } from '@/lib/publishing/view';
import { SubscribeForm } from '@/components/publishing/SubscribeForm';
import { SignInPrompt } from '@/components/worldforge/PersistenceUI';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'My Subscriptions' };

export default async function SubscriptionsPage() {
  const user = await getUser();
  if (!user) {
    return (
      <>
        <PageHeader eyebrow="Account" title="My subscriptions" description="Manage your intelligence digest." />
        <Section>
          <SignInPrompt message="Sign in to manage your subscription" redirectedFrom="/account/subscriptions" />
        </Section>
      </>
    );
  }

  const res = await getSubscriptionAccountAction();
  let data: SubscriptionAccountData;
  let isDemo = false;
  if (res.ok) data = res.data;
  else {
    data = demoSubscriptionAccount();
    isDemo = res.code === 'NOT_CONFIGURED';
  }

  const prefs = data.preferences;

  return (
    <>
      <PageHeader eyebrow="Account" title="My subscriptions" description="Manage your intelligence digest preferences." />
      <Section>
        {isDemo ? (
          <p className="mb-4 rounded-card border border-warning/40 bg-warning/5 px-3 py-2 text-caption text-warning">
            Showing demo content — connect Supabase to manage a live subscription.
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="space-y-3 border-border" padded>
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
              <Mail className="h-4 w-4 text-electric" /> Current subscription
            </h2>
            {data.subscriber ? (
              <div className="space-y-1 text-caption text-text-secondary">
                <p><span className="text-text-muted">Email:</span> {data.subscriber.email}</p>
                <p><span className="text-text-muted">Tier:</span> {data.subscriber.type}</p>
                <p><span className="text-text-muted">Status:</span> {data.subscriber.active ? 'Active' : 'Inactive'}</p>
                {prefs ? (
                  <>
                    <p><span className="text-text-muted">Cadence:</span> {prefs.digest_frequency}</p>
                    <p><span className="text-text-muted">Topics:</span> {readStringArray(prefs.topics).join(', ') || 'all'}</p>
                    <p><span className="text-text-muted">Channels:</span> {readStringArray(prefs.channels).join(', ') || 'email'}</p>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="text-caption text-text-muted">You are not subscribed yet.</p>
            )}
            {data.recentDigests.length > 0 ? (
              <div>
                <div className="mb-1 text-label uppercase tracking-wide text-text-muted">Recent digests</div>
                <ul className="space-y-1 text-[12px] text-text-secondary">
                  {data.recentDigests.map((d) => (
                    <li key={d.id}>{d.kind} · {d.item_count ?? 0} items · {formatDate(d.created_at)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card className="space-y-3 border-border" padded>
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
              <Settings className="h-4 w-4 text-electric" /> Update preferences
            </h2>
            <SubscribeForm
              subscribeAction={subscribeAction}
              unsubscribeAction={unsubscribeAction}
              signedIn
              currentEmail={data.subscriber?.email}
              currentActive={data.subscriber?.active === true}
            />
          </Card>
        </div>
      </Section>
    </>
  );
}

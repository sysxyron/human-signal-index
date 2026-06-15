'use client';

// HSI Phase 38 — billing actions (client). Upgrade (Stripe-hosted checkout),
// Manage Billing (Stripe Billing Portal), and a monthly/annual toggle. No card
// data is ever collected here — we only redirect to Stripe-hosted pages. Org-admin
// only (page + DAL gate). Never touches RBAC.
import { useState, useTransition } from 'react';
import { Card, Button } from '@hsi/ui';
import { Loader2, ArrowUpRight, CreditCard, Check } from 'lucide-react';
import {
  createCheckoutSessionAction, createBillingPortalSessionAction,
  type PlanOption, type BillingCenter,
} from '@/lib/billing/billing';

export function BillingActions({ center }: { center: BillingCenter }) {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>(center.billingCycle);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const go = (key: string, run: () => Promise<{ ok: boolean; data?: { url: string }; error?: string }>) => {
    setMsg(null); setBusy(key);
    startTransition(async () => {
      const r = await run();
      if (r.ok && r.data?.url) { window.location.href = r.data.url; return; }
      setMsg(r.error ?? 'Action unavailable.'); setBusy(null);
    });
  };

  if (!center.canManage) {
    return <Card className="border-border" padded><p className="text-caption text-text-secondary">Only organization owners and administrators can change the plan or manage billing.</p></Card>;
  }
  if (!center.stripeEnabled) {
    return <Card className="border-border" padded><p className="text-caption text-text-secondary">Self-serve billing is not enabled on this deployment. Contact your platform administrator to change plans.</p></Card>;
  }

  const upgradeable = center.plans.filter((p) => p.purchasable && !p.current);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-btn border border-border bg-surface/50 p-0.5 text-label">
          {(['monthly', 'annual'] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCycle(c)}
              className={`rounded-btn px-3 py-1.5 font-semibold capitalize transition ${cycle === c ? 'bg-primary/20 text-white' : 'text-text-muted hover:text-text-primary'}`}>{c}{c === 'annual' ? ' (save)' : ''}</button>
          ))}
        </div>
        {center.hasCustomer ? (
          <Button variant="secondary" onClick={() => go('portal', createBillingPortalSessionAction)} disabled={pending}>
            {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Manage Billing
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {center.plans.map((p) => <PlanCard key={p.slug} plan={p} cycle={cycle} busy={busy === `co_${p.slug}`} pending={pending}
          onUpgrade={() => go(`co_${p.slug}`, () => createCheckoutSessionAction(p.slug, cycle))} />)}
      </div>
      {upgradeable.length === 0 ? <p className="text-label text-text-muted">You&apos;re on the highest available plan.</p> : null}
      {msg ? <div className="rounded-card border border-risk/40 bg-risk/10 px-4 py-2.5 text-caption text-text-secondary">{msg}</div> : null}
    </div>
  );
}

function PlanCard({ plan, cycle, busy, pending, onUpgrade }: { plan: PlanOption; cycle: 'monthly' | 'annual'; busy: boolean; pending: boolean; onUpgrade: () => void }) {
  const price = cycle === 'annual' ? plan.annualLabel : plan.monthlyLabel;
  return (
    <Card className={`flex flex-col gap-2 border-border ${plan.current ? 'ring-1 ring-primary/40' : ''}`} padded>
      <div className="flex items-center justify-between"><span className="text-h6 font-bold text-text-primary">{plan.name}</span>{plan.current ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-label font-semibold text-electric"><Check className="h-3 w-3" /> Current</span> : null}</div>
      <div className="text-h5 font-bold tabular-nums text-text-primary">{price}</div>
      <p className="flex-1 text-label text-text-muted">{plan.description}</p>
      {plan.current ? (
        <Button variant="secondary" disabled className="w-full">Current plan</Button>
      ) : plan.purchasable ? (
        <Button onClick={onUpgrade} disabled={pending} className="w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />} Choose {plan.name}</Button>
      ) : (
        <Button variant="secondary" disabled className="w-full">Free</Button>
      )}
    </Card>
  );
}

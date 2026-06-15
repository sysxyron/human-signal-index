'use client';

// HSI Phase 37 — platform plan + entitlement editor (client). Admin only (page +
// DAL requireAdmin gate). Toggles plan active state and per-feature entitlements
// (enabled + numeric limit). Every save audited server-side. No RBAC writes.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@hsi/ui';
import { Check, X, Power, Loader2 } from 'lucide-react';
import { setPlanActiveAction, setEntitlementAction, type PlanRow } from '@/lib/billing/billing';
import type { Entitlement } from '@hsi/entitlements';

const LABELS: Record<string, string> = {
  advanced_analytics: 'Advanced analytics', white_label: 'White-label', api_access: 'API access',
  custom_domains: 'Custom domains', ai_agents: 'AI agents', bulk_exports: 'Bulk exports',
  advanced_governance: 'Advanced governance', organization_branding: 'Organization branding', team_workspaces: 'Team workspaces',
  investigations_limit: 'Investigations limit', publications_limit: 'Publications limit', contributors_limit: 'Contributors limit',
};

export function PlanEditor({ plan }: { plan: PlanRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const run = (key: string, fn: () => Promise<{ ok: boolean }>) => { setBusyKey(key); startTransition(async () => { await fn(); setBusyKey(null); router.refresh(); }); };
  const isLimit = (e: Entitlement) => e.featureKey.endsWith('_limit');

  return (
    <Card className="space-y-3 border-border" padded>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><span className="text-h6 font-bold text-text-primary">{plan.name}</span><span className="rounded-full bg-surface-2 px-2 py-0.5 text-label text-text-muted">tier {plan.tier}</span></div>
          {plan.description ? <p className="text-label text-text-muted">{plan.description}</p> : null}
        </div>
        <button type="button" disabled={pending} onClick={() => run('active', () => setPlanActiveAction(plan.id, !plan.active))}
          className="inline-flex items-center gap-1.5 rounded-btn border border-border px-3 py-1.5 text-label font-semibold transition hover:bg-surface-2"
          style={{ color: plan.active ? '#10B981' : '#94A3B8' }}>
          {busyKey === 'active' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />} {plan.active ? 'Active' : 'Inactive'}
        </button>
      </div>
      <div className="divide-y divide-border/50 border-t border-border">
        {plan.entitlements.map((e) => (
          <div key={e.featureKey} className="flex items-center justify-between gap-3 py-2">
            <span className="text-caption text-text-secondary">{LABELS[e.featureKey] ?? e.featureKey}</span>
            {isLimit(e) ? (
              <LimitInput plan={plan} ent={e} busy={busyKey === e.featureKey} disabled={pending}
                onSave={(v) => run(e.featureKey, () => setEntitlementAction(plan.id, e.featureKey, e.enabled, v))} />
            ) : (
              <button type="button" disabled={pending} onClick={() => run(e.featureKey, () => setEntitlementAction(plan.id, e.featureKey, !e.enabled, e.limitValue))}
                className="inline-flex items-center gap-1.5 rounded-btn px-2.5 py-1 text-label font-semibold transition hover:bg-surface-2"
                style={{ color: e.enabled ? '#10B981' : '#94A3B8' }}>
                {busyKey === e.featureKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : e.enabled ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {e.enabled ? 'Enabled' : 'Disabled'}
              </button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function LimitInput({ plan, ent, busy, disabled, onSave }: { plan: PlanRow; ent: Entitlement; busy: boolean; disabled: boolean; onSave: (v: number | null) => void }) {
  void plan;
  const [val, setVal] = useState<string>(ent.limitValue === null ? '' : String(ent.limitValue));
  return (
    <div className="flex items-center gap-1.5">
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="∞" inputMode="numeric"
        className="w-24 rounded-btn border border-border bg-surface px-2 py-1 text-right text-label tabular-nums text-text-primary" />
      <button type="button" disabled={disabled} onClick={() => { const t = val.trim(); onSave(t === '' ? null : Number(t)); }}
        className="inline-flex items-center rounded-btn border border-border px-2 py-1 text-label font-semibold text-text-secondary transition hover:bg-surface-2">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
      </button>
    </div>
  );
}

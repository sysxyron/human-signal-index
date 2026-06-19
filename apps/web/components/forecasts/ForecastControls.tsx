'use client';

// =============================================================================
// HSI Phase 67 — Forecast controls (client, admin). Create a forecast (recorded,
// immutable), record an outcome, resolve (evaluate), expire, and recompute
// calibration. Deterministic inputs only — no AI predictions. Admin-gated actions.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Input, Button } from '@hsi/ui';
import { Target, Save, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { createForecastAction, recordOutcomeAction, resolveForecastAction, expireForecastAction, recomputeCalibrationAction } from '@/lib/forecasts/actions';
import type { PredictionType } from '@/lib/forecasts/types';

const TYPES: PredictionType[] = ['binary', 'probability', 'multi-outcome', 'range', 'narrative', 'event', 'trend'];

function buildValue(type: PredictionType, fields: { outcome: string; probability: string; option: string; min: string; max: string }): Record<string, unknown> {
  switch (type) {
    case 'binary': case 'event': return { outcome: fields.outcome || 'no' };
    case 'probability': return { probability: Number(fields.probability) || 0 };
    case 'range': return { min: Number(fields.min) || 0, max: Number(fields.max) || 0 };
    default: return { option: fields.option };
  }
}

function ValueFields({ type, f, set }: { type: PredictionType; f: Record<string, string>; set: (k: string, v: string) => void }) {
  if (type === 'binary' || type === 'event') return (
    <select value={f.outcome} onChange={(e) => set('outcome', e.target.value)} className="rounded-btn border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary" aria-label="Predicted outcome"><option value="yes">yes</option><option value="no">no</option></select>
  );
  if (type === 'probability') return <Input value={f.probability} onChange={(e) => set('probability', e.target.value)} placeholder="Probability 0–1" aria-label="Probability" />;
  if (type === 'range') return <div className="flex gap-2"><Input value={f.min} onChange={(e) => set('min', e.target.value)} placeholder="min" aria-label="min" /><Input value={f.max} onChange={(e) => set('max', e.target.value)} placeholder="max" aria-label="max" /></div>;
  return <Input value={f.option} onChange={(e) => set('option', e.target.value)} placeholder="Predicted option / direction" aria-label="Predicted option" />;
}

export function CreateForecastForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<PredictionType>('binary');
  const [confidence, setConfidence] = useState('');
  const [resolution, setResolution] = useState('');
  const [f, setF] = useState({ outcome: 'yes', probability: '', option: '', min: '', max: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = () =>
    start(async () => {
      setMsg(null);
      const r = await createForecastAction({
        title, predictionType: type,
        confidence: confidence ? Number(confidence) : null,
        resolutionDate: resolution ? new Date(resolution).toISOString() : null,
        predictedValue: buildValue(type, f), source: 'manual',
      });
      if (r.ok) { setMsg('Forecast recorded.'); setTitle(''); setConfidence(''); setResolution(''); router.push(`/dashboard/forecast-validation/${r.data.id}` as never); }
      else setMsg(r.error ?? 'Create failed.');
    });

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Target className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Record a forecast</h3></div>
      <p className="text-caption text-text-muted">Forecasts are immutable once recorded and evaluated against reality later. No AI prediction — you state the prediction.</p>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Forecast title" aria-label="Title" />
      <div className="flex flex-wrap items-end gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as PredictionType)} className="rounded-btn border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary" aria-label="Prediction type">{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <ValueFields type={type} f={f} set={set} />
        <Input value={confidence} onChange={(e) => setConfidence(e.target.value)} placeholder="Confidence 0–1" className="w-32" aria-label="Confidence" />
        <input type="datetime-local" value={resolution} onChange={(e) => setResolution(e.target.value)} className="rounded-btn border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary" aria-label="Resolution date" />
      </div>
      <div className="flex items-center gap-3"><Button variant="primary" disabled={pending || !title.trim()} onClick={submit}><Save className="h-4 w-4" /> Record forecast</Button>{msg ? <span className="text-caption text-text-muted">{msg}</span> : null}</div>
    </Card>
  );
}

export function OutcomeAndResolveControls({ id, type }: { id: string; type: PredictionType }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ outcome: 'yes', probability: '', option: '', min: '', max: '' });
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { setMsg(null); const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Failed.')); if (r.ok) router.refresh(); });

  return (
    <Card className="space-y-3">
      <h3 className="text-h6 font-semibold text-text-primary">Record outcome &amp; resolve</h3>
      <div className="flex flex-wrap items-end gap-2">
        <ValueFields type={type} f={f} set={set} />
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Outcome label (optional)" aria-label="Outcome label" />
        <Button variant="secondary" disabled={pending} onClick={() => run(() => recordOutcomeAction(id, { actualValue: actualValue(type, f), outcomeLabel: label || undefined }), 'Outcome recorded.')}><Save className="h-4 w-4" /> Record outcome</Button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => resolveForecastAction(id), 'Resolved.')}><CheckCircle2 className="h-4 w-4" /> Resolve</Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => expireForecastAction(id), 'Expired.')}><Clock className="h-4 w-4" /> Expire</Button>
        {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
      </div>
    </Card>
  );
}

function actualValue(type: PredictionType, f: Record<string, string>): Record<string, unknown> {
  switch (type) {
    case 'binary': return { outcome: f.outcome || 'no' };
    case 'event': return { occurred: f.outcome || 'no' };
    case 'probability': return { outcome: f.outcome || 'no' };
    case 'range': return { value: Number(f.min) || 0 };
    default: return { option: f.option };
  }
}

export function RecomputeCalibrationButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => { const r = await recomputeCalibrationAction(); setMsg(r.ok ? 'Calibration recomputed.' : (r.error ?? 'Failed.')); if (r.ok) router.refresh(); })}><RefreshCw className="h-4 w-4" /> Recompute calibration</Button>
      {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
    </div>
  );
}

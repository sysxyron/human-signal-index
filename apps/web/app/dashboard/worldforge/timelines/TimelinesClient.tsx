'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { TopNav, Card, Button } from '@hsi/ui';
import { Save } from 'lucide-react';
import { generateTimeline, type TimelineKind } from '@hsi/timeline-engine';
import type { WorldTimelineRecord } from '@hsi/shared-types';
import { TimelineTrack, fmtYears } from '@/components/worldforge/TimelineTrack';
import { WORLD_LIST, getBaseState, type WorldId } from '@/lib/worldforge/worlds';
import {
  ErrorCard,
  SuccessNotice,
  SimulationPicker,
  SignInPrompt,
} from '@/components/worldforge/PersistenceUI';
import { useSimulationTargets } from '@/components/worldforge/useSimulationTargets';
import {
  saveTimelineAction,
  listTimelinesAction,
} from '@/app/dashboard/worldforge/actions';
import { timelineEventsToJson } from '@/lib/worldforge/mappers';

const KINDS: { id: TimelineKind; label: string }[] = [
  { id: 'evolution', label: 'Evolution' },
  { id: 'civilization', label: 'Civilization' },
  { id: 'planetary', label: 'Planetary' },
  { id: 'stellar', label: 'Stellar' },
];

const GYR = 1e9;
const SPANS: { id: string; label: string; years: number }[] = [
  { id: 'kyr', label: 'Thousands (10 kyr)', years: 1e4 },
  { id: 'myr', label: 'Millions (10 Myr)', years: 1e7 },
  { id: 'gyr', label: 'Billions (1 Gyr)', years: 1 * GYR },
  { id: 'deep', label: 'Deep time (100 Gyr)', years: 100 * GYR },
];

export function TimelinesClient({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const pathname = usePathname();
  const [worldId, setWorldId] = useState<WorldId>('earth');
  const [kind, setKind] = useState<TimelineKind>('evolution');
  const [spanId, setSpanId] = useState('gyr');

  const span = SPANS.find((s) => s.id === spanId)?.years ?? GYR;
  const state = getBaseState(worldId);

  const events = useMemo(
    () => generateTimeline(state, kind, span),
    [state, kind, span],
  );

  // --- persistence ----------------------------------------------------------
  const targets = useSimulationTargets();
  const [saved, setSaved] = useState<WorldTimelineRecord[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [pending, startSave] = useTransition();
  const canWrite = isAuthenticated && !authExpired;

  const loadSaved = useCallback((simId: string) => {
    if (!simId) return;
    listTimelinesAction(simId).then((res) => {
      if (res.ok) setSaved(res.data);
      else setSaveError(res.error);
    });
  }, []);

  useEffect(() => {
    if (targets.selectedId) loadSaved(targets.selectedId);
  }, [targets.selectedId, loadSaved]);

  const onSave = () => {
    if (!targets.selectedId) return;
    setSaveError(null);
    setNotice(null);
    startSave(async () => {
      const res = await saveTimelineAction(
        targets.selectedId,
        kind,
        span,
        timelineEventsToJson(events),
      );
      if (res.ok) {
        setNotice(`Saved ${kind} timeline (${events.length} events).`);
        loadSaved(targets.selectedId);
      } else if (res.code === 'AUTH_REQUIRED') {
        setAuthExpired(true);
      } else {
        setSaveError(res.error);
      }
    });
  };

  return (
    <>
      <TopNav title="Timelines" subtitle="Log-scaled deep-time event viewer" />
      <main className="space-y-6 p-5 lg:p-6">
        <Card className="space-y-4" padded>
          <div className="grid gap-4 md:grid-cols-3">
            <Selector label="World">
              <div className="flex flex-wrap gap-2">
                {WORLD_LIST.map((w) => (
                  <Chip
                    key={w.id}
                    active={w.id === worldId}
                    onClick={() => setWorldId(w.id)}
                    label={w.name}
                  />
                ))}
              </div>
            </Selector>
            <Selector label="Timeline kind">
              <div className="flex flex-wrap gap-2">
                {KINDS.map((k) => (
                  <Chip
                    key={k.id}
                    active={k.id === kind}
                    onClick={() => setKind(k.id)}
                    label={k.label}
                  />
                ))}
              </div>
            </Selector>
            <Selector label="Span">
              <div className="flex flex-wrap gap-2">
                {SPANS.map((s) => (
                  <Chip
                    key={s.id}
                    active={s.id === spanId}
                    onClick={() => setSpanId(s.id)}
                    label={s.label}
                  />
                ))}
              </div>
            </Selector>
          </div>
        </Card>

        <Card className="space-y-4" padded>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-h6 font-semibold text-text-primary">
              {WORLD_LIST.find((w) => w.id === worldId)?.name} ·{' '}
              {KINDS.find((k) => k.id === kind)?.label} timeline
            </h3>
            <span className="text-caption text-text-muted">
              {events.length} events · span 0 → {fmtYears(span)} (log scale)
            </span>
          </div>
          <TimelineTrack events={events} span={span} />
        </Card>

        {/* Save timeline */}
        <Card className="space-y-3" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <Save className="h-4 w-4 text-electric" /> Save timeline
          </h3>
          {targets.error ? <ErrorCard message={targets.error} /> : null}
          {saveError ? <ErrorCard message={saveError} /> : null}
          {notice ? <SuccessNotice message={notice} /> : null}
          {canWrite ? (
            <div className="flex flex-wrap items-end gap-3">
              <SimulationPicker
                simulations={targets.simulations}
                value={targets.selectedId}
                onChange={(id) => {
                  targets.setSelectedId(id);
                  loadSaved(id);
                }}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={onSave}
                disabled={pending || targets.loading || !targets.selectedId}
                title={
                  targets.selectedId
                    ? 'Persist the current timeline'
                    : 'Select a saved simulation first'
                }
              >
                <Save className="h-4 w-4" /> Save current timeline
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-caption text-text-secondary">
                {authExpired
                  ? 'Your session expired. Sign in again to save this timeline.'
                  : 'Saving a timeline requires an account. Generating and viewing timelines is free.'}
              </p>
              <SignInPrompt message="Sign in to save" redirectedFrom={pathname} />
            </div>
          )}

          {saved && saved.length ? (
            <div className="space-y-2">
              <p className="text-label text-text-muted">Saved timelines</p>
              <ul className="space-y-2">
                {saved.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2"
                  >
                    <span className="text-body-sm font-medium text-text-primary">
                      {t.kind}
                    </span>
                    <span className="font-mono text-caption text-text-muted">
                      {t.events.length} events ·{' '}
                      {t.span_years ? fmtYears(t.span_years) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : saved ? (
            <p className="text-caption text-text-muted">No saved timelines yet.</p>
          ) : null}
        </Card>
      </main>
    </>
  );
}

function Selector({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="block text-label text-text-secondary">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-btn border px-3 py-1.5 text-caption font-semibold transition ${
        active
          ? 'border-electric/60 bg-primary/15 text-white'
          : 'border-border bg-surface-2/60 text-text-secondary hover:border-electric hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

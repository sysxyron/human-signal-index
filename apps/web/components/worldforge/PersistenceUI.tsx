'use client';

// =============================================================================
// WorldForge — shared client UI for the Supabase persistence layer.
// Small, reusable presentational pieces: an error card (renders a DbResult.error
// message without crashing), an "offline / demo" notice, and a simulation picker
// used by the save-target pages.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { AlertTriangle, CloudOff, Database, LogIn } from 'lucide-react';
import type { SimulationRecord } from '@hsi/shared-types';

/**
 * Inline sign-in prompt shown where a WRITE action would be. Renders an exact
 * gating message + a link to /sign-in?redirectedFrom=<current path>. Used both
 * for the up-front disabled state (!isAuthenticated) and the runtime case where
 * an action returns code:'AUTH_REQUIRED' (session expiry).
 */
export function SignInPrompt({
  message,
  redirectedFrom,
}: {
  message: string;
  redirectedFrom: string;
}) {
  const href = `/sign-in?redirectedFrom=${encodeURIComponent(redirectedFrom)}`;
  return (
    <Link href={href as never} className="inline-block">
      <span className="inline-flex items-center gap-2 rounded-btn border border-electric/40 bg-electric/5 px-3.5 py-2 text-caption font-semibold text-electric transition hover:border-electric hover:bg-electric/10 hover:text-white">
        <LogIn className="h-3.5 w-3.5" />
        {message}
      </span>
    </Link>
  );
}

/** Renders a DbResult error message in a styled card. Never throws. */
export function ErrorCard({
  message,
  title = 'Persistence error',
}: {
  message: string;
  title?: string;
}) {
  return (
    <Card className="space-y-1.5 border-risk/40 bg-risk/5" padded>
      <h4 className="flex items-center gap-2 text-h6 font-semibold text-risk">
        <AlertTriangle className="h-4 w-4" /> {title}
      </h4>
      <p className="text-caption leading-relaxed text-text-secondary">{message}</p>
    </Card>
  );
}

/** Small inline notice that the page is running on engine/demo data only. */
export function OfflineNotice({
  message = 'Offline — showing demo data. Supabase persistence is not configured.',
}: {
  message?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-btn border border-warning/40 bg-warning/10 px-3 py-2 text-caption font-medium text-warning">
      <CloudOff className="h-3.5 w-3.5" />
      {message}
    </div>
  );
}

/** Small inline notice confirming a write succeeded. */
export function SuccessNotice({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-btn border border-verified/40 bg-verified/10 px-3 py-2 text-caption font-medium text-verified">
      <Database className="h-3.5 w-3.5" />
      {message}
    </div>
  );
}

/**
 * Simulation picker for the save-target pages. When the list is empty it renders
 * a helpful empty state instead of an unusable dropdown.
 */
export function SimulationPicker({
  simulations,
  value,
  onChange,
  label = 'Save target simulation',
}: {
  simulations: SimulationRecord[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  if (simulations.length === 0) {
    return (
      <div className="space-y-1.5">
        <span className="block text-label text-text-secondary">{label}</span>
        <p className="rounded-btn border border-border bg-surface-2/40 px-3 py-2 text-caption text-text-muted">
          No saved simulations yet — create one from the Simulations page.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <span className="block text-label text-text-secondary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full max-w-md appearance-none rounded-btn border border-border bg-surface/90 px-3 py-2 text-sm text-text-primary outline-none focus:border-electric"
      >
        {simulations.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

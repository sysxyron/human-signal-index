'use client';

// =============================================================================
// HSI Phase 41B.2 — native Accessibility Center (no third-party widget).
//
// A floating button opens a panel of preferences that apply instantly and
// persist in localStorage: text size, high contrast, reduced motion, a
// dyslexia-friendly font, keyboard-navigation help, and reset. Preferences are
// applied by setting a CSS var + classes on <html> (see globals.css), so they
// affect the whole site. WCAG-minded: labelled controls, focus management,
// Escape to close, and a persistent visible focus ring.
// =============================================================================

import { useEffect, useState } from 'react';
import { Accessibility, Minus, Plus, Contrast, Eye, Type, Keyboard, RotateCcw, X } from 'lucide-react';

interface A11ySettings {
  fontScale: number;
  contrast: boolean;
  reduceMotion: boolean;
  dyslexia: boolean;
}

const STORAGE_KEY = 'hsi-a11y';
const DEFAULTS: A11ySettings = { fontScale: 1, contrast: false, reduceMotion: false, dyslexia: false };
const MIN_SCALE = 0.9;
const MAX_SCALE = 1.5;

function load(): A11ySettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<A11ySettings>) };
  } catch {
    return DEFAULTS;
  }
}

function apply(s: A11ySettings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--a11y-font-scale', String(s.fontScale));
  root.classList.toggle('a11y-contrast', s.contrast);
  root.classList.toggle('a11y-reduce-motion', s.reduceMotion);
  root.classList.toggle('a11y-dyslexia', s.dyslexia);
}

export function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [settings, setSettings] = useState<A11ySettings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  // Load + apply persisted settings once on mount.
  useEffect(() => {
    const s = load();
    setSettings(s);
    apply(s);
    setHydrated(true);
  }, []);

  // Apply + persist on every change (after hydration so we don't clobber storage).
  useEffect(() => {
    if (!hydrated) return;
    apply(settings);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings, hydrated]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const set = (patch: Partial<A11ySettings>) => setSettings((s) => ({ ...s, ...patch }));
  const stepScale = (d: number) => set({ fontScale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round((settings.fontScale + d) * 10) / 10)) });
  const reset = () => setSettings(DEFAULTS);

  return (
    <>
      <button
        type="button"
        aria-label="Accessibility options"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-electric shadow-glow transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric"
      >
        <Accessibility className="h-6 w-6" />
      </button>

      {open ? (
        <div role="dialog" aria-label="Accessibility preferences" aria-modal="false"
          className="fixed bottom-20 right-5 z-50 w-[20rem] max-w-[calc(100vw-2.5rem)] rounded-card border border-border bg-surface p-4 shadow-glow">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-body-sm font-semibold text-text-primary">
              <Accessibility className="h-4 w-4 text-electric" /> Accessibility
            </h2>
            <button type="button" aria-label="Close accessibility panel" onClick={() => setOpen(false)} className="rounded-lg p-1 text-text-muted hover:text-text-primary"><X className="h-4 w-4" /></button>
          </div>

          {/* Text size */}
          <div className="flex items-center justify-between rounded-btn border border-border bg-surface-2/40 px-3 py-2">
            <span className="flex items-center gap-2 text-caption text-text-secondary"><Type className="h-4 w-4" /> Text size</span>
            <span className="flex items-center gap-2">
              <button type="button" aria-label="Decrease text size" disabled={settings.fontScale <= MIN_SCALE} onClick={() => stepScale(-0.1)} className="rounded-md border border-border p-1 text-text-secondary hover:text-text-primary disabled:opacity-40"><Minus className="h-4 w-4" /></button>
              <span className="w-10 text-center text-caption tabular-nums text-text-primary">{Math.round(settings.fontScale * 100)}%</span>
              <button type="button" aria-label="Increase text size" disabled={settings.fontScale >= MAX_SCALE} onClick={() => stepScale(0.1)} className="rounded-md border border-border p-1 text-text-secondary hover:text-text-primary disabled:opacity-40"><Plus className="h-4 w-4" /></button>
            </span>
          </div>

          {/* Toggles */}
          <div className="mt-2 space-y-1.5">
            <Toggle icon={Contrast} label="High contrast" checked={settings.contrast} onChange={(v) => set({ contrast: v })} />
            <Toggle icon={Eye} label="Reduced motion" checked={settings.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
            <Toggle icon={Type} label="Dyslexia-friendly font" checked={settings.dyslexia} onChange={(v) => set({ dyslexia: v })} />
          </div>

          {/* Keyboard help */}
          <button type="button" onClick={() => setShowKeys((v) => !v)} aria-expanded={showKeys}
            className="mt-2 flex w-full items-center gap-2 rounded-btn border border-border bg-surface-2/40 px-3 py-2 text-caption text-text-secondary hover:text-text-primary">
            <Keyboard className="h-4 w-4" /> Keyboard navigation help
          </button>
          {showKeys ? (
            <ul className="mt-1.5 space-y-1 rounded-btn border border-border bg-surface-2/30 px-3 py-2 text-caption text-text-muted">
              <li><b className="text-text-secondary">Tab</b> / <b className="text-text-secondary">Shift+Tab</b> — move between links and controls</li>
              <li><b className="text-text-secondary">Enter</b> / <b className="text-text-secondary">Space</b> — activate the focused control</li>
              <li><b className="text-text-secondary">Esc</b> — close this panel or an open menu</li>
              <li>A visible focus ring always shows your current position.</li>
            </ul>
          ) : null}

          <div className="mt-3 flex items-center justify-between">
            <a href="/accessibility" className="text-caption font-semibold text-electric hover:text-white">Accessibility statement</a>
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-caption text-text-muted hover:text-text-primary"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Toggle({ icon: Icon, label, checked, onChange }: { icon: typeof Contrast; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-btn border border-border bg-surface-2/40 px-3 py-2">
      <span className="flex items-center gap-2 text-caption text-text-secondary"><Icon className="h-4 w-4" /> {label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-electric" aria-label={label} />
    </label>
  );
}

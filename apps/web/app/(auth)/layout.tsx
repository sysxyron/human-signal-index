// =============================================================================
// Auth route-group layout — centered, dark, glassmorphism shell.
// Wraps sign-in / sign-up / reset-password / update-password. Server Component
// (no client state needed) reusing the @hsi/ui dark aesthetic + brand mark.
// =============================================================================

import { Card } from '@hsi/ui';
import { Activity } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="grid-bg absolute inset-0 opacity-30" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative w-full max-w-md space-y-6">
        {/* Brand */}
        <a href="/" className="flex items-center justify-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent shadow-glow">
            <Activity className="h-4.5 w-4.5 text-white" />
          </span>
          <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-text-primary">
            Human Signal Index
          </span>
        </a>

        <Card className="space-y-6" padded>
          {children}
        </Card>

        <p className="text-center text-caption text-text-muted">
          WorldForge · causal world-simulation subsystem
        </p>
      </div>
    </div>
  );
}

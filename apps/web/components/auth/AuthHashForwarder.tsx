'use client';

// =============================================================================
// AuthHashForwarder (Phase 24C-C) — defensive auth hardening.
//
// Mounted on the public homepage. If a Supabase auth hash lands here (e.g. a
// magic link that inherited the project Site URL → "/#access_token=…"), it
// forwards to the verified /auth/callback handler, preserving the hash EXACTLY.
// Ordinary homepage visitors (no auth hash) are never redirected.
//
// Renders nothing. Touches no session/token directly — it only relocates the URL;
// /auth/callback (unchanged) establishes the session.
// =============================================================================

import { useEffect } from 'react';
import { authHashForwardPath } from '@/lib/auth/auth-hash';

export function AuthHashForwarder() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const target = authHashForwardPath(window.location.hash);
    if (target) {
      // replace() (not assign) so the token-bearing URL isn't kept in history.
      window.location.replace(target);
    }
  }, []);
  return null;
}

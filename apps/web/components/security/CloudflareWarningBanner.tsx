// =============================================================================
// HSI Phase 14 — CloudflareWarningBanner. Shown when SecurityDashboardData
// carries a `cloudflareWarning` OR any health detail flags a challenge. Explains
// the failure mode (HTML interstitial in front of programmatic Supabase
// endpoints) and points to the deployment doc + the WAF skip guidance.
// Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { ShieldAlert } from 'lucide-react';

const DOC_PATH = 'docs/deployment/cloudflare-supabase-auth.md';

export function CloudflareWarningBanner({ message }: { message?: string }) {
  return (
    <Card className="space-y-3 border-warning/40 bg-warning/5" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-warning">
        <ShieldAlert className="h-4 w-4" /> Cloudflare may be challenging Supabase
        endpoints
      </h3>
      <p className="text-body-sm leading-relaxed text-text-secondary">
        {message ||
          'A health probe detected an HTML challenge (e.g. "Just a moment…") in front of a programmatic Supabase endpoint. Cloudflare bot/threat mitigations (Browser Integrity Check, Bot Fight Mode, Managed Challenge, some WAF rules) return a text/html interstitial instead of JSON — which breaks browser fetch() calls to Auth / REST / Storage and surfaces as "Failed to fetch" logins.'}
      </p>
      <ul className="ml-4 list-disc space-y-1 text-body-sm text-text-secondary">
        <li>
          Add WAF skip / bypass rules for the Supabase API host so{' '}
          <span className="font-mono text-text-primary">/auth/v1/*</span>,{' '}
          <span className="font-mono text-text-primary">/rest/v1/*</span> and{' '}
          <span className="font-mono text-text-primary">/storage/v1/*</span> are not
          challenged.
        </li>
        <li>
          Disable Browser Integrity Check / Bot Fight Mode for the API hostname (it is
          API traffic, not page traffic).
        </li>
      </ul>
      <p className="text-caption text-text-muted">
        Full guidance:{' '}
        <span className="font-mono text-electric">{DOC_PATH}</span> (Cloudflare +
        Supabase Auth — WAF skip rules &amp; Bot Fight Mode).
      </p>
    </Card>
  );
}

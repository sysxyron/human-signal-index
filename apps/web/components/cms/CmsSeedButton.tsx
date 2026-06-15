'use client';

// =============================================================================
// HSI Phase 31B — "Seed existing site content" admin action (client). Idempotent:
// safe to click repeatedly. Surfaces in the CMS empty state + as a manual backfill.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Loader2, Sprout } from 'lucide-react';
import { seedCmsContentAction } from '@/lib/cms/seed';

export function CmsSeedButton({ label = 'Seed existing site content' }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function seed() {
    setMsg(null);
    startTransition(async () => {
      const res = await seedCmsContentAction();
      if (res.ok) {
        const d = res.data;
        setMsg(`Seeded ${d.pages} pages, ${d.navItems} nav, ${d.roles} roles, ${d.missions} missions, ${d.badges} badges, ${d.onboarding} onboarding, ${d.emails} emails.`);
        router.refresh();
      } else {
        setMsg(res.error ?? 'Seeding failed.');
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={seed} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />} {label}</Button>
      {msg ? <p className="text-caption text-text-secondary">{msg}</p> : null}
    </div>
  );
}

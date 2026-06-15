'use client';

// =============================================================================
// HSI Phase 36 — self-service organization creation (client). Creates the org,
// assigns the creator as owner, audits, and switches workspace automatically.
// Membership only — never touches global RBAC.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { Loader2, Building2 } from 'lucide-react';
import { createOrganizationAction } from '@/lib/org/operations';
import { setCurrentOrganizationAction } from '@/lib/org/organizations';

export function OrgCreateForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function create() {
    setMsg(null);
    startTransition(async () => {
      const res = await createOrganizationAction({ name, description: description || undefined });
      if (res.ok) {
        await setCurrentOrganizationAction(res.data.slug);
        router.push('/dashboard/org' as never);
      } else {
        setMsg(res.error ?? (res.code === 'NOT_CONFIGURED' ? 'Organization creation needs the server service-role key.' : 'Could not create organization.'));
      }
    });
  }

  return (
    <Card className="space-y-3 border-border" padded>
      <label className="space-y-1"><span className="text-label text-text-muted">Organization name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Research" className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" />
      </label>
      <label className="space-y-1"><span className="text-label text-text-muted">Description (optional)</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" />
      </label>
      {msg ? <p className="text-caption text-error">{msg}</p> : null}
      <Button onClick={create} disabled={pending || name.trim().length < 2}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />} Create organization</Button>
      <p className="text-label text-text-muted">You become the owner. This creates an isolated workspace; it does not change your platform role.</p>
    </Card>
  );
}

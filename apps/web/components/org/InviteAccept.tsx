'use client';

// =============================================================================
// HSI Phase 36 — invitation acceptance (client). Joins the org + assigns the
// membership role (server-only, token-gated). Switches workspace on success.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Loader2, Check } from 'lucide-react';
import { acceptInvitationAction } from '@/lib/org/operations';

export function InviteAccept({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function accept() {
    setMsg(null);
    startTransition(async () => {
      const res = await acceptInvitationAction(token);
      if (res.ok) { router.push('/dashboard/org' as never); }
      else setMsg(res.error ?? (res.code === 'AUTH_REQUIRED' ? 'Please sign in with the invited email first.' : 'Could not accept the invitation.'));
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={accept} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept invitation</Button>
      {msg ? <p className="text-caption text-error">{msg}</p> : null}
    </div>
  );
}

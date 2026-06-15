// =============================================================================
// HSI Phase 36 — Organization Invitation acceptance (/org/invite/[token]).
// Server Component, force-dynamic. Validates the invite (token + email + expiry)
// and lets the signed-in invitee join. Acceptance is server-only + token-gated;
// it assigns ORG membership only — never global RBAC.
// =============================================================================

import Link from 'next/link';
import { Building2, AlertTriangle } from 'lucide-react';
import { getUser } from '@/lib/supabase/server';
import { getInvitationAction } from '@/lib/org/operations';
import { InviteAccept } from '@/components/org/InviteAccept';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InvitePage({ params }: { params: { token: string } }) {
  const [user, res] = await Promise.all([getUser(), getInvitationAction(params.token)]);
  const invite = res.ok ? res.data : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-5 p-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-card bg-gradient-to-br from-primary to-accent text-white"><Building2 className="h-7 w-7" /></span>
      {!invite || invite.state === 'not_found' ? (
        <>
          <h1 className="text-h3 font-bold text-text-primary">Invitation not found</h1>
          <p className="text-body text-text-secondary">This invitation link is invalid.</p>
        </>
      ) : invite.state === 'expired' ? (
        <><AlertTriangle className="h-6 w-6 text-warning" /><h1 className="text-h3 font-bold text-text-primary">Invitation expired</h1><p className="text-body text-text-secondary">Ask an administrator of {invite.organizationName} to re-invite you.</p></>
      ) : invite.state === 'accepted' ? (
        <><h1 className="text-h3 font-bold text-text-primary">Already accepted</h1><p className="text-body text-text-secondary">You&apos;ve already joined {invite.organizationName}.</p><Link href={"/dashboard/org" as never} className="text-electric hover:underline">Go to your organization →</Link></>
      ) : (
        <>
          <h1 className="text-h3 font-bold text-text-primary">Join {invite.organizationName}</h1>
          <p className="text-body text-text-secondary">You&apos;ve been invited as <strong className="text-text-primary">{invite.role}</strong> ({invite.email}). Organization membership never changes your platform access.</p>
          {user ? <InviteAccept token={params.token} /> : (
            <p className="text-caption text-text-secondary">Please <Link href={"/sign-in" as never} className="text-electric hover:underline">sign in</Link> with {invite.email} to accept.</p>
          )}
        </>
      )}
      <Link href={"/" as never} className="text-caption text-text-muted hover:text-text-primary">← Home</Link>
    </main>
  );
}

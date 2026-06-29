// =============================================================================
// HSI Milestone 86 — Beta & Demo Intake (/dashboard/beta-launch/intake).
//
// Server Component, force-dynamic, ADMIN-ONLY (self-gated). Surfaces the inbound
// beta_applications + demo_requests captured by the public forms (Milestone 86).
// Read-only queue view — triage/accept/reject actions live in the beta program
// flow. PII (email) is admin-gated. Degrades to an empty queue when no rows exist.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { listBetaApplications, listDemoRequests } from '@/lib/beta-intake/persistence';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2 py-0.5 text-caption text-text-secondary">
      {status}
    </span>
  );
}

export default async function IntakePage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);

  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Beta & Demo Intake" subtitle="Inbound applications & demo requests" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState
            code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'}
            title="Insufficient permissions"
            message={user ? 'Intake is available to administrators.' : 'Sign in to review intake.'}
            redirectedFrom="/dashboard/beta-launch/intake"
          />
        </main>
      </>
    );
  }

  const [applications, demos] = await Promise.all([listBetaApplications(200), listDemoRequests(200)]);

  return (
    <>
      <TopNav title="Beta & Demo Intake" subtitle="Inbound applications & demo requests captured from the public forms" />
      <main className="space-y-6 p-5 lg:p-6">
        {/* Beta applications */}
        <section className="rounded-card border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-h6 font-semibold text-text-primary">Beta applications</h2>
            <span className="text-caption text-text-muted">{applications.length} record(s)</span>
          </header>
          {applications.length === 0 ? (
            <p className="px-5 py-8 text-center text-body-sm text-text-secondary">No beta applications yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-border text-left text-caption text-text-muted">
                    <th className="px-5 py-2 font-medium">Name</th>
                    <th className="px-5 py-2 font-medium">Email</th>
                    <th className="px-5 py-2 font-medium">Organization</th>
                    <th className="px-5 py-2 font-medium">Role</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((a) => (
                    <tr key={a.id} className="border-b border-border/50">
                      <td className="px-5 py-2 text-text-primary">{a.name}</td>
                      <td className="px-5 py-2 text-text-secondary">{a.email}</td>
                      <td className="px-5 py-2 text-text-secondary">{a.organization ?? '—'}</td>
                      <td className="px-5 py-2 text-text-secondary">{a.role}</td>
                      <td className="px-5 py-2"><StatusBadge status={a.status} /></td>
                      <td className="px-5 py-2 text-text-muted">{a.createdLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Demo requests */}
        <section className="rounded-card border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-h6 font-semibold text-text-primary">Demo requests</h2>
            <span className="text-caption text-text-muted">{demos.length} record(s)</span>
          </header>
          {demos.length === 0 ? (
            <p className="px-5 py-8 text-center text-body-sm text-text-secondary">No demo requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-border text-left text-caption text-text-muted">
                    <th className="px-5 py-2 font-medium">Name</th>
                    <th className="px-5 py-2 font-medium">Email</th>
                    <th className="px-5 py-2 font-medium">Organization</th>
                    <th className="px-5 py-2 font-medium">Use case</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {demos.map((d) => (
                    <tr key={d.id} className="border-b border-border/50">
                      <td className="px-5 py-2 text-text-primary">{d.name}</td>
                      <td className="px-5 py-2 text-text-secondary">{d.email}</td>
                      <td className="px-5 py-2 text-text-secondary">{d.organization}</td>
                      <td className="px-5 py-2 text-text-secondary">{d.useCase}</td>
                      <td className="px-5 py-2"><StatusBadge status={d.status} /></td>
                      <td className="px-5 py-2 text-text-muted">{d.createdLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

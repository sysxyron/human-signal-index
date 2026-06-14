import { DashboardPage } from '../../../components/dashboard-shell';
import { Card, Input, Select } from '@hsi/ui';
import { User, Bell, Shield, SlidersHorizontal, Info } from 'lucide-react';
import Link from 'next/link';
import { SafeActionButton } from '@/components/navigation/SafeActionButton';
import { reasonFor } from '@/lib/settings/controls';

// A read-only visual toggle. In beta it is intentionally non-interactive and
// labeled with the reason; there are no dead controls (the reason explains why).
function Toggle({ label, on = false }: { label: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 opacity-60">
      <span className="text-body-sm text-text-secondary">{label}</span>
      <span
        aria-disabled
        className={`relative h-5 w-9 cursor-not-allowed rounded-full transition ${on ? 'bg-primary/60' : 'bg-surface-3'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white/70 transition ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <DashboardPage title="Settings" subtitle="Workspace and account configuration">
      <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
        <p className="text-caption leading-relaxed text-text-secondary">
          Settings are <span className="font-semibold text-text-primary">read-only in beta</span> — preferences aren&apos;t saved yet, and
          each control below explains its status. Your role, status, and team are managed by an administrator; see your{' '}
          <Link href={'/dashboard/profile' as never} className="font-semibold text-electric hover:text-white">profile</Link> for what your account can do.
        </p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-electric" />
            <h3 className="text-h6 font-semibold text-text-primary">Profile</h3>
          </div>
          <Input label="Display name" defaultValue="Xyron Architect" id="s-name" disabled />
          <p className="text-label text-text-muted">{reasonFor('display_name')}</p>
          <Input label="Email" type="email" defaultValue="claude@amenxlabs.com" id="s-email" disabled />
          <p className="text-label text-text-muted">{reasonFor('email')}</p>
          <Select label="Role" id="s-role" disabled defaultValue="Administrator">
            <option>Administrator</option>
            <option>Analyst</option>
            <option>Reviewer</option>
          </Select>
          <p className="text-label text-text-muted">{reasonFor('role')}</p>
          <div className="flex justify-end">
            <SafeActionButton variant="primary" disabledReason={reasonFor('save_profile')}>Save changes</SafeActionButton>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-accent" />
            <h3 className="text-h6 font-semibold text-text-primary">Notifications</h3>
          </div>
          <div className="divide-y divide-border">
            <Toggle label="Critical risk alerts" on />
            <Toggle label="New evidence in subscribed signals" on />
            <Toggle label="Daily digest email" />
            <Toggle label="Review assignment notifications" on />
            <Toggle label="Security events" on />
          </div>
          <p className="text-label text-text-muted">{reasonFor('notif_critical')}</p>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-verified" />
            <h3 className="text-h6 font-semibold text-text-primary">Security</h3>
          </div>
          <div className="divide-y divide-border">
            <Toggle label="Two-factor authentication" on />
            <Toggle label="Require MFA for exports" on />
            <Toggle label="Session auto-lock (15m)" />
          </div>
          <p className="text-label text-text-muted">{reasonFor('sec_mfa')}</p>
          <div className="flex justify-end">
            <SafeActionButton variant="secondary" disabledReason={reasonFor('api_keys')}>Manage API keys</SafeActionButton>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-warning" />
            <h3 className="text-h6 font-semibold text-text-primary">Preferences</h3>
          </div>
          <Select label="Default dashboard view" id="s-view" disabled defaultValue="Mission Control">
            <option>Mission Control</option>
            <option>Review Queue</option>
            <option>Alerts</option>
          </Select>
          <Select label="Risk threshold for alerts" id="s-thresh" disabled defaultValue="High (4+)">
            <option>High (4+)</option>
            <option>Moderate (3+)</option>
            <option>Critical only (5)</option>
          </Select>
          <Toggle label="Show traceability badges everywhere" on />
          <p className="text-label text-text-muted">{reasonFor('pref_view')}</p>
        </Card>
      </div>
    </DashboardPage>
  );
}

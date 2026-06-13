import { DashboardPage } from '../../../components/dashboard-shell';
import { Card, Input, Select } from '@hsi/ui';
import { User, Bell, Shield, SlidersHorizontal } from 'lucide-react';
import { SafeActionButton } from '@/components/navigation/SafeActionButton';

function Toggle({ label, on = false }: { label: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-body-sm text-text-secondary">{label}</span>
      <span
        className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-primary' : 'bg-surface-3'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${on ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <DashboardPage title="Settings" subtitle="Workspace and account configuration">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-electric" />
            <h3 className="text-h6 font-semibold text-text-primary">Profile</h3>
          </div>
          <Input label="Display name" defaultValue="Xyron Architect" id="s-name" />
          <Input label="Email" type="email" defaultValue="claude@amenxlabs.com" id="s-email" />
          <Select label="Role" id="s-role">
            <option>Administrator</option>
            <option>Analyst</option>
            <option>Reviewer</option>
          </Select>
          <div className="flex justify-end">
            <SafeActionButton variant="primary" disabledReason="Settings persistence is not enabled in this environment.">Save changes</SafeActionButton>
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
          <div className="flex justify-end">
            <SafeActionButton variant="secondary" disabledReason="API key management is available to admins in the Security Center.">Manage API keys</SafeActionButton>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-warning" />
            <h3 className="text-h6 font-semibold text-text-primary">Preferences</h3>
          </div>
          <Select label="Default dashboard view" id="s-view">
            <option>Mission Control</option>
            <option>Review Queue</option>
            <option>Alerts</option>
          </Select>
          <Select label="Risk threshold for alerts" id="s-thresh">
            <option>High (4+)</option>
            <option>Moderate (3+)</option>
            <option>Critical only (5)</option>
          </Select>
          <Toggle label="Show traceability badges everywhere" on />
        </Card>
      </div>
    </DashboardPage>
  );
}

// =============================================================================
// HSI Phase 24D — settings control audit. PURE.
//
// The canonical audit of every control on /dashboard/settings: each is either
// WIRED to real persistence or DISABLED with a clear, user-facing reason. There
// are NO dead controls. The settings page renders to match this audit; the test
// asserts every control is wired-or-explained.
//
// (No user-preferences table exists, so preferences are intentionally disabled
// with labels rather than adding unnecessary schema — per the phase guidance.)
// =============================================================================

export type ControlState = 'wired' | 'disabled';

export interface SettingsControl {
  id: string;
  label: string;
  kind: 'input' | 'select' | 'toggle' | 'button';
  state: ControlState;
  /** Required when state === 'disabled': the visible reason shown to the user. */
  reason?: string;
}

export const SETTINGS_CONTROLS: SettingsControl[] = [
  { id: 'display_name', label: 'Display name', kind: 'input', state: 'disabled', reason: 'Editing your display name is coming soon.' },
  { id: 'email', label: 'Email', kind: 'input', state: 'disabled', reason: 'Your email is managed by your account sign-in and cannot be changed here.' },
  { id: 'role', label: 'Role', kind: 'select', state: 'disabled', reason: 'Roles are managed by an administrator in Administration → Users.' },
  { id: 'save_profile', label: 'Save changes', kind: 'button', state: 'disabled', reason: 'Profile saving is not connected in beta.' },
  { id: 'notif_critical', label: 'Critical risk alerts', kind: 'toggle', state: 'disabled', reason: 'Notification settings are not connected yet.' },
  { id: 'notif_evidence', label: 'New evidence in subscribed signals', kind: 'toggle', state: 'disabled', reason: 'Notification settings are not connected yet.' },
  { id: 'notif_digest', label: 'Daily digest email', kind: 'toggle', state: 'disabled', reason: 'Notification settings are not connected yet.' },
  { id: 'notif_review', label: 'Review assignment notifications', kind: 'toggle', state: 'disabled', reason: 'Notification settings are not connected yet.' },
  { id: 'notif_security', label: 'Security events', kind: 'toggle', state: 'disabled', reason: 'Notification settings are not connected yet.' },
  { id: 'sec_mfa', label: 'Two-factor authentication', kind: 'toggle', state: 'disabled', reason: 'Security settings are managed by an administrator.' },
  { id: 'sec_mfa_exports', label: 'Require MFA for exports', kind: 'toggle', state: 'disabled', reason: 'Security settings are managed by an administrator.' },
  { id: 'sec_autolock', label: 'Session auto-lock', kind: 'toggle', state: 'disabled', reason: 'Security settings are managed by an administrator.' },
  { id: 'api_keys', label: 'Manage API keys', kind: 'button', state: 'disabled', reason: 'API key management is not available in beta.' },
  { id: 'pref_view', label: 'Default dashboard view', kind: 'select', state: 'disabled', reason: 'Saving preferences is coming soon.' },
  { id: 'pref_threshold', label: 'Risk threshold for alerts', kind: 'select', state: 'disabled', reason: 'Saving preferences is coming soon.' },
  { id: 'pref_trace', label: 'Show traceability badges', kind: 'toggle', state: 'disabled', reason: 'Saving preferences is coming soon.' },
];

/** Controls that are dead: neither wired nor explained. MUST always be empty. */
export function deadControls(controls: SettingsControl[] = SETTINGS_CONTROLS): SettingsControl[] {
  return controls.filter((c) => c.state === 'disabled' && (!c.reason || c.reason.trim().length === 0));
}

export function reasonFor(id: string): string | undefined {
  return SETTINGS_CONTROLS.find((c) => c.id === id)?.reason;
}

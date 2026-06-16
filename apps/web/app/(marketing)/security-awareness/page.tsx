import { PageHeader, Section } from '../../../components/page-header';
import { Card } from '@hsi/ui';
import {
  Fish, Users, KeyRound, Lock, UserCheck, Database, EyeOff, ShieldAlert,
} from 'lucide-react';

import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Security Awareness',
  description:
    'Practical security habits for testers, researchers, and analysts: phishing, MFA, passwords, protecting sources, and handling data safely.',
  alternates: { canonical: '/security-awareness' },
};

const topics = [
  {
    icon: Fish, title: 'Phishing',
    points: [
      'Check the sender address, not just the display name.',
      'Hover over links before clicking; watch for look-alike domains.',
      'We will never ask for your password by email.',
      'When in doubt, open the site yourself instead of clicking a link.',
    ],
  },
  {
    icon: Users, title: 'Social engineering',
    points: [
      'Be wary of urgency, secrecy, or pressure to bypass a process.',
      'Verify unusual requests through a second, known channel.',
      'No one on our team needs your login to help you.',
    ],
  },
  {
    icon: KeyRound, title: 'Multi-factor authentication',
    points: [
      'Turn on MFA wherever it is offered.',
      'Prefer an authenticator app or hardware key over SMS.',
      'Keep backup codes somewhere safe and offline.',
    ],
  },
  {
    icon: Lock, title: 'Passwords',
    points: [
      'Use a long, unique passphrase for each account.',
      'Use a password manager so you do not have to remember them.',
      'Change a password immediately if you suspect it leaked.',
    ],
  },
  {
    icon: UserCheck, title: 'Protecting your account',
    points: [
      'Sign out on shared devices.',
      'Review active sessions and revoke ones you do not recognize.',
      'Report anything that looks off. A false alarm beats a missed breach.',
    ],
  },
  {
    icon: Database, title: 'Handling data',
    points: [
      'Share information only with people who need it.',
      'Do not paste sensitive data into tools you do not control.',
      'Delete what you no longer need.',
    ],
  },
  {
    icon: EyeOff, title: 'Protecting sources',
    points: [
      'Strip metadata from files before sharing them.',
      'Avoid linking a source to identifying details in the same place.',
      'Use our confidential reporting channel for sensitive material.',
    ],
  },
  {
    icon: ShieldAlert, title: 'Operational security',
    points: [
      'Keep your devices and browser up to date.',
      'Separate personal and research accounts.',
      'Assume that anything online can be logged, and plan accordingly.',
    ],
  },
];

export default function SecurityAwarenessPage() {
  return (
    <>
      <PageHeader
        eyebrow="Security Awareness"
        title="Stay safe while you do the work."
        description="Short, practical guidance for testers, researchers, and analysts. Most incidents start with a small mistake. These habits prevent the common ones."
      />

      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          {topics.map((t) => {
            const Icon = t.icon;
            return (
              <Card key={t.title} className="space-y-3">
                <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-electric/15 text-electric"><Icon className="h-5 w-5" /></span>
                  {t.title}
                </h2>
                <ul className="space-y-1.5">
                  {t.points.map((p) => (
                    <li key={p} className="flex gap-2 text-body-sm text-text-secondary"><span className="text-electric">•</span> {p}</li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section className="pt-0">
        <Card className="text-body-sm text-text-secondary">
          Spotted something that looks like an attack on the platform? Report it through{' '}
          <a href="/security/responsible-disclosure" className="font-semibold text-electric hover:text-white">responsible disclosure</a>. Need to report misconduct? Use the{' '}
          <a href="/whistleblower" className="font-semibold text-electric hover:text-white">whistleblower center</a>.
        </Card>
      </Section>
    </>
  );
}

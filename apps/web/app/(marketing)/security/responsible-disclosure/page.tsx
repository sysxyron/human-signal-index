import { PageHeader, Section } from '../../../../components/page-header';
import { Card } from '@hsi/ui';
import { ListOrdered, Clock, MessagesSquare, Handshake, AlertTriangle } from 'lucide-react';

export const metadata = { title: 'Responsible Disclosure' };

const steps = [
  ['Report it', 'Send what you found to security@amenxlabs.com — a vulnerability, a security weakness, an abuse pattern, or platform misuse. Include enough detail for us to reproduce it.'],
  ['We confirm', 'We acknowledge your report within three business days and let you know we are looking into it.'],
  ['We investigate', 'We assess the severity and impact, reproduce the issue, and decide on a fix. We may ask you for more detail.'],
  ['We fix and verify', 'We ship a fix, verify it, and confirm with you that the issue is resolved.'],
  ['We close it out', 'We tell you it is done and, with your permission, credit you for the report.'],
];

export default function ResponsibleDisclosurePage() {
  return (
    <>
      <PageHeader
        eyebrow="Security"
        title="Responsible Disclosure"
        description="A clear, predictable process for reporting vulnerabilities, security findings, abuse, and platform weaknesses — and what happens after you do."
      />

      <Section>
        <Card className="space-y-4">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><ListOrdered className="h-5 w-5 text-electric" /> The process</h2>
          <ol className="space-y-3">
            {steps.map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-electric/15 text-caption font-bold text-electric">{i + 1}</span>
                <div>
                  <div className="text-body font-semibold text-text-primary">{title}</div>
                  <p className="text-body-sm text-text-secondary">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </Section>

      <Section className="pt-0">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="space-y-2">
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Clock className="h-4 w-4 text-electric" /> Timelines</h3>
            <p className="text-body-sm text-text-secondary">Acknowledgement within 3 business days. An initial assessment within 10. Critical issues are prioritized immediately.</p>
          </Card>
          <Card className="space-y-2">
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><MessagesSquare className="h-4 w-4 text-electric" /> Communication</h3>
            <p className="text-body-sm text-text-secondary">We keep one thread per report and update you at each stage. If we go quiet, it is safe to follow up.</p>
          </Card>
          <Card className="space-y-2">
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Handshake className="h-4 w-4 text-electric" /> Expectations</h3>
            <p className="text-body-sm text-text-secondary">Report in good faith, avoid harming users or data, and give us time to fix the issue before discussing it publicly.</p>
          </Card>
        </div>
      </Section>

      <Section className="pt-0">
        <Card className="flex items-start gap-3 border-warning/40 bg-warning/5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <p className="text-body-sm text-text-secondary">
            For technical vulnerabilities, see the full <a href="/security/vulnerability-disclosure" className="font-semibold text-electric hover:text-white">vulnerability disclosure policy</a>, which includes our safe-harbor statement and scope. To report misconduct rather than a security flaw, use the <a href="/whistleblower" className="font-semibold text-electric hover:text-white">whistleblower center</a>.
          </p>
        </Card>
      </Section>
    </>
  );
}

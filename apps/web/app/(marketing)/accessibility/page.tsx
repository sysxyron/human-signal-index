import type { Metadata } from 'next';
import { PageHeader, Section } from '../../../components/page-header';
import { Card } from '@hsi/ui';
import { Type, Contrast, Eye, Keyboard, Accessibility as A11yIcon } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Accessibility',
  description: 'How Human Signal Index supports accessible reading and navigation, the built-in accessibility tools, and how to report an accessibility issue.',
  alternates: { canonical: '/accessibility' },
};

const tools = [
  { icon: Type, title: 'Adjustable text size', body: 'Increase or decrease text from 90% to 150% across the whole site. Your choice is remembered on this device.' },
  { icon: Contrast, title: 'High-contrast mode', body: 'Stronger text and border contrast for easier reading in bright conditions or for low-vision users.' },
  { icon: Eye, title: 'Reduced motion', body: 'Turns off animations and transitions for anyone sensitive to movement.' },
  { icon: Type, title: 'Dyslexia-friendly font', body: 'Switches to a more legible typeface with wider letter and word spacing.' },
  { icon: Keyboard, title: 'Keyboard navigation', body: 'Every link and control is reachable with Tab and Enter, with a clear, always-visible focus outline.' },
];

export default function AccessibilityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Accessibility"
        title="Accessibility at Human Signal Index"
        description="We want the public record we publish to be usable by everyone. This page explains the tools we build in and how to reach us if something gets in your way."
      />

      <Section>
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <A11yIcon className="h-5 w-5 text-electric" />
            <h2 className="text-h5 font-semibold text-text-primary">Built-in accessibility tools</h2>
          </div>
          <p className="text-body-sm text-text-secondary">
            Open the accessibility button in the bottom-right corner of any page to adjust how the site
            looks and behaves. These tools run entirely in your browser. We do not use a third-party
            overlay, and your preferences are stored only on your device.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {tools.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.title} className="flex items-start gap-3 rounded-card border border-border bg-surface-2/40 p-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
                  <div>
                    <h3 className="text-body-sm font-semibold text-text-primary">{t.title}</h3>
                    <p className="text-caption text-text-secondary">{t.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </Section>

      <Section className="pt-0">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-2">
            <h2 className="text-h6 font-semibold text-text-primary">Our commitment</h2>
            <p className="text-body-sm text-text-secondary">
              We aim to meet the spirit of the Web Content Accessibility Guidelines (WCAG) 2.1 at level AA.
              That means readable contrast, text that scales, content that works with a keyboard and a
              screen reader, and clear, plain language. Accessibility is part of our review process, not an
              afterthought.
            </p>
          </Card>
          <Card className="space-y-2">
            <h2 className="text-h6 font-semibold text-text-primary">Report a problem</h2>
            <p className="text-body-sm text-text-secondary">
              If any part of this site is hard to use, please tell us. Email{' '}
              <span className="font-mono text-text-primary">accessibility@humansignalindex.org</span> with
              the page address and a short description. We treat accessibility reports as a priority and
              will respond with a plan to fix the issue.
            </p>
          </Card>
        </div>
      </Section>
    </>
  );
}

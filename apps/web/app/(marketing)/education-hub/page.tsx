import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, Section } from '../../../components/page-header';
import { Card, CategoryTag, SectionEyebrow, Button } from '@hsi/ui';
import { BookOpen, ArrowUpRight, PlayCircle, Clock, ArrowRight } from 'lucide-react';
import { GUIDES } from '@/lib/education/guides';
import { TRACKS, TOTAL_LESSONS } from '@/lib/education/curriculum';
import { OnboardingChecklist } from '@/components/docs/OnboardingChecklist';

export const metadata: Metadata = {
  title: 'Education Hub',
  description:
    'A structured learning center for Human Signal Index: getting started, researcher, analyst, reviewer, operations, and administration tracks, plus guides and onboarding.',
  keywords: ['HSI education', 'OSINT training', 'intelligence analysis course', 'research methodology', 'onboarding'],
  alternates: { canonical: '/education-hub' },
  openGraph: { title: 'Human Signal Index Education Hub', description: 'Structured learning tracks for researchers, analysts, reviewers, operations, and administrators.', url: '/education-hub', type: 'website' },
};

export default function EducationHubPage() {
  return (
    <main className="text-text-primary">
      <PageHeader
        eyebrow="Education Hub"
        title="Learn to use HSI, step by step."
        description="Structured learning tracks for every role, free guides, and a new-user checklist. Video lessons are in production; written guides are available today."
      >
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href={'/how-hsi-works' as never}><Button variant="primary" size="lg">How HSI Works <ArrowRight className="h-4 w-4" /></Button></Link>
          <Link href={'/docs' as never}><Button variant="secondary" size="lg">Documentation</Button></Link>
        </div>
      </PageHeader>

      {/* Learning tracks */}
      <Section>
        <div className="mb-6 max-w-2xl space-y-2"><SectionEyebrow>Learning tracks</SectionEyebrow><h2 className="text-h3 font-bold lg:text-h2">{TRACKS.length} tracks · {TOTAL_LESSONS} lessons</h2><p className="text-body-lg text-text-secondary">Video lessons are in production. Each is listed below and marked as upcoming.</p></div>
        <div className="space-y-6">
          {TRACKS.map((t) => (
            <Card key={t.key} className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-h5 font-semibold text-text-primary">{t.title}</h3>
                <span className="text-caption text-text-muted">{t.audience}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {t.lessons.map((l) => (
                  <div key={l.title} className="space-y-2 rounded-card border border-border bg-background-deep/40 p-4">
                    <div className="flex items-center gap-2 text-text-muted"><PlayCircle className="h-4 w-4" /><span className="text-[10px] uppercase tracking-wide">Video lesson</span></div>
                    <h4 className="text-body-sm font-semibold text-text-primary">{l.title}</h4>
                    <p className="text-caption text-text-secondary">{l.summary}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning"><Clock className="h-3 w-3" /> Video Coming Soon</span>
                      <span className="text-[10px] text-text-muted">Length TBD</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {/* Onboarding checklist */}
      <Section className="pt-0">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <OnboardingChecklist />
          <Card className="space-y-3">
            <SectionEyebrow>Where to start</SectionEyebrow>
            <p className="text-body-sm text-text-secondary">If you are new, read <a href="/docs/concepts" className="font-semibold text-electric hover:underline">core concepts</a>, then the <a href="/docs/workflow" className="font-semibold text-electric hover:underline">workflow</a> and <a href="/docs/methodology" className="font-semibold text-electric hover:underline">methodology</a>. Researchers should follow the Researcher track; analysts the Analyst track.</p>
            <p className="text-body-sm text-text-secondary">Full reference material lives in the <a href="/docs" className="font-semibold text-electric hover:underline">documentation portal</a>.</p>
          </Card>
        </div>
      </Section>

      {/* Existing written guides */}
      <Section className="pt-0">
        <div className="mb-6 max-w-2xl space-y-2"><SectionEyebrow>Guides</SectionEyebrow><h2 className="text-h3 font-bold lg:text-h2">Written guides and explainers.</h2></div>
        <div className="grid gap-4 sm:grid-cols-2">
          {GUIDES.map((g) => (
            <Card key={g.slug} interactive className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/15 text-electric"><BookOpen className="h-5 w-5" /></span>
                <CategoryTag label={g.tag} tone={g.tone} />
              </div>
              <h3 className="text-h6 font-semibold text-text-primary">{g.title}</h3>
              <p className="text-body-sm text-text-secondary">{g.summary}</p>
              <Link href={`/education-hub/${g.slug}` as never} className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-btn border border-border bg-surface-2/60 px-3 py-1.5 text-caption font-semibold text-electric transition hover:border-electric hover:text-white">
                Open guide <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Card>
          ))}
        </div>
      </Section>
    </main>
  );
}

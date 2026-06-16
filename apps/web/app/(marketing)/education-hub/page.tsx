import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, Section } from '../../../components/page-header';
import { Card, CategoryTag } from '@hsi/ui';
import { BookOpen, ArrowUpRight } from 'lucide-react';
import { GUIDES } from '@/lib/education/guides';

export const metadata: Metadata = {
  title: 'Education Hub',
  description:
    'Free guides, explainers, and classroom resources for reading signal records, spotting rhetorical techniques, and teaching media literacy with HSI data.',
  alternates: { canonical: '/education-hub' },
};

const curriculum = [
  'Foundations of narrative analysis',
  'Influence operations 101',
  'Evaluating sources and evidence',
  'Risk, harm, and proportionality',
  'Building counter-narratives responsibly',
];

export default function EducationHubPage() {
  return (
    <>
      <PageHeader
        eyebrow="Education Hub"
        title="Learn to read the signals for yourself."
        description="Free guides, explainers, and classroom resources for researchers, journalists, educators, and curious readers."
      />

      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          {GUIDES.map((g) => (
            <Card key={g.slug} interactive className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/15 text-electric">
                  <BookOpen className="h-5 w-5" />
                </span>
                <CategoryTag label={g.tag} tone={g.tone} />
              </div>
              <h2 className="text-h6 font-semibold text-text-primary">{g.title}</h2>
              <p className="text-body-sm text-text-secondary">{g.summary}</p>
              <Link
                href={`/education-hub/${g.slug}` as never}
                className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-btn border border-border bg-surface-2/60 px-3 py-1.5 text-caption font-semibold text-electric transition hover:border-electric hover:text-white"
              >
                Open guide <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Card>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <Card className="space-y-4">
          <h2 className="text-h5 font-semibold text-text-primary">Self-paced curriculum</h2>
          <p className="text-body-sm text-text-secondary">
            A structured path from the fundamentals of narrative analysis to responsible counter-narrative practice.
          </p>
          <ol className="grid gap-3 sm:grid-cols-2">
            {curriculum.map((c, i) => (
              <li key={c} className="flex items-center gap-3 rounded-card border border-border bg-surface-2/50 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-caption font-bold text-electric">
                  {i + 1}
                </span>
                <span className="text-body-sm text-text-secondary">{c}</span>
              </li>
            ))}
          </ol>
        </Card>
      </Section>
    </>
  );
}

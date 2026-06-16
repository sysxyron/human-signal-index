import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader, Section } from '../../../../components/page-header';
import { Card } from '@hsi/ui';
import { ArrowLeft, CheckCircle2, Clock } from 'lucide-react';
import { GUIDES, getGuide } from '@/lib/education/guides';

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const guide = getGuide(params.slug);
  if (!guide) return { title: 'Guide not found' };
  return {
    title: guide.title,
    description: guide.summary,
    alternates: { canonical: `/education-hub/${guide.slug}` },
  };
}

export default function EducationGuidePage({ params }: { params: { slug: string } }) {
  const guide = getGuide(params.slug);
  if (!guide) notFound();

  return (
    <>
      <PageHeader eyebrow="Education Hub" title={guide.title} description={guide.summary} />

      <Section>
        <Link href={'/education-hub' as never} className="mb-6 inline-flex items-center gap-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-4 w-4" /> All guides
        </Link>

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_18rem]">
          <article className="space-y-5">
            <section className="space-y-2">
              <h2 className="text-h5 font-semibold text-text-primary">Overview</h2>
              <p className="text-body text-text-secondary">{guide.summary}</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-h6 font-semibold text-text-primary">What you will learn</h2>
              <ul className="space-y-1.5">
                {guide.objectives.map((o) => (
                  <li key={o} className="flex items-start gap-2 text-body-sm text-text-secondary">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-electric" /> {o}
                  </li>
                ))}
              </ul>
            </section>

            {/* Structural placeholder — full lesson content is in preparation. */}
            <section className="space-y-2">
              <h2 className="text-h6 font-semibold text-text-primary">Lesson</h2>
              <Card className="flex items-start gap-2.5 border-warning/40 bg-warning/5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-body-sm text-text-secondary">
                  The full written lesson for this guide is being prepared by our education team and will
                  appear here. The structure above outlines what it will cover. In the meantime, you can
                  explore real records in the <Link href={'/signal-library' as never} className="font-semibold text-electric hover:text-white">Signal Library</Link>.
                </p>
              </Card>
            </section>
          </article>

          <aside className="space-y-3">
            <Card className="space-y-2">
              <h3 className="text-label uppercase tracking-wide text-text-muted">Format</h3>
              <p className="text-body-sm text-text-primary">{guide.tag}</p>
              <h3 className="pt-2 text-label uppercase tracking-wide text-text-muted">Status</h3>
              <p className="text-body-sm text-text-secondary">In preparation</p>
            </Card>
          </aside>
        </div>
      </Section>
    </>
  );
}

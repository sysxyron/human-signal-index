import { PageHeader, Section } from '../../../components/page-header';
import { Card, Button, CategoryTag } from '@hsi/ui';
import {
  BookOpen,
  GraduationCap,
  PlayCircle,
  FileText,
  ArrowUpRight,
} from 'lucide-react';

export const metadata = { title: 'Education Hub' };

const guides = [
  { icon: BookOpen, title: 'How to read a signal record', body: 'Understand risk levels, categories, and what a traceability score actually means.', tag: 'Guide', tone: 'blue' as const },
  { icon: PlayCircle, title: 'Spotting rhetorical techniques', body: 'A visual walkthrough of in-group framing, urgency appeals, and authority mimicry.', tag: 'Video', tone: 'purple' as const },
  { icon: FileText, title: 'Provenance & evidence chains', body: 'Why traceability is the backbone of credible signal intelligence.', tag: 'Explainer', tone: 'green' as const },
  { icon: GraduationCap, title: 'Classroom toolkit', body: 'Lesson plans and exercises for teaching media literacy with HSI data.', tag: 'Educators', tone: 'orange' as const },
];

const curriculum = [
  'Foundations of narrative analysis',
  'Influence operations 101',
  'Evaluating sources & evidence',
  'Risk, harm, and proportionality',
  'Building counter-narratives responsibly',
];

export default function EducationHubPage() {
  return (
    <>
      <PageHeader
        eyebrow="Education Hub"
        title="Learn to read the signals for yourself."
        description="Free guides, explainers, and classroom resources for researchers, journalists, educators, and curious citizens."
      />

      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          {guides.map((g) => {
            const Icon = g.icon;
            return (
              <Card key={g.title} interactive className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/15 text-electric">
                    <Icon className="h-5 w-5" />
                  </span>
                  <CategoryTag label={g.tag} tone={g.tone} />
                </div>
                <h2 className="text-h6 font-semibold text-text-primary">{g.title}</h2>
                <p className="text-body-sm text-text-secondary">{g.body}</p>
                <Button variant="secondary" size="sm" className="mt-auto w-fit" disabled title="Full guides are being prepared and will be available soon.">
                  Open <ArrowUpRight className="h-4 w-4" />
                </Button>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section className="pt-0">
        <Card className="space-y-4">
          <h2 className="text-h5 font-semibold text-text-primary">Self-paced curriculum</h2>
          <p className="text-body-sm text-text-secondary">
            A structured path from the fundamentals of narrative analysis to
            responsible counter-narrative practice.
          </p>
          <ol className="grid gap-3 sm:grid-cols-2">
            {curriculum.map((c, i) => (
              <li
                key={c}
                className="flex items-center gap-3 rounded-card border border-border bg-surface-2/50 px-4 py-3"
              >
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

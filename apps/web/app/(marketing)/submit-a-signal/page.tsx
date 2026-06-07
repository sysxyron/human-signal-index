import { PageHeader, Section } from '../../../components/page-header';
import { Card, Button, Input, Select, Textarea } from '@hsi/ui';
import { Upload, ShieldCheck, Lock, Eye } from 'lucide-react';

export const metadata = { title: 'Submit a Signal' };

const assurances = [
  { icon: ShieldCheck, title: 'Human-reviewed', body: 'Every submission is evaluated by a trained reviewer.' },
  { icon: Lock, title: 'Source-protective', body: 'We never publish submitter identities without consent.' },
  { icon: Eye, title: 'Public-interest only', body: 'We analyze public narratives, not private individuals.' },
];

export default function SubmitSignalPage() {
  return (
    <>
      <PageHeader
        eyebrow="Submit a Signal"
        title="Spotted a narrative worth investigating?"
        description="Share a public signal for review. The more context and evidence you provide, the faster we can trace and assess it."
      />

      <Section>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="space-y-5">
            <form className="space-y-5">
              <Input
                label="Source URL"
                type="url"
                placeholder="https://…"
                hint="A direct link to the public post, article, or video."
                id="sig-url"
              />
              <Textarea
                label="What did you observe?"
                rows={4}
                placeholder="Describe the narrative, claim, or campaign and why it stood out…"
                id="sig-text"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Platform" id="sig-platform" defaultValue="">
                  <option value="" disabled>
                    Select a platform
                  </option>
                  <option>X / Twitter</option>
                  <option>Facebook</option>
                  <option>Telegram</option>
                  <option>YouTube</option>
                  <option>Reddit</option>
                  <option>TikTok</option>
                  <option>News / Web</option>
                  <option>Other</option>
                </Select>
                <Select label="Category" id="sig-category" defaultValue="">
                  <option value="" disabled>
                    Select a category
                  </option>
                  <option>Misinformation</option>
                  <option>Disinformation</option>
                  <option>Influence operation</option>
                  <option>Recruitment</option>
                  <option>Astroturfing</option>
                  <option>Civic / Election</option>
                  <option>Unsure</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <span className="block text-label text-text-secondary">
                  Supporting evidence
                </span>
                <label
                  htmlFor="sig-file"
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface-2/40 px-6 py-8 text-center transition hover:border-electric"
                >
                  <Upload className="h-6 w-6 text-text-muted" />
                  <span className="text-body-sm text-text-secondary">
                    Drop screenshots or files here, or{' '}
                    <span className="text-electric">browse</span>
                  </span>
                  <span className="text-caption text-text-muted">
                    PNG, JPG, PDF — up to 25MB
                  </span>
                  <input id="sig-file" type="file" className="hidden" multiple />
                </label>
              </div>

              <Textarea
                label="Additional notes (optional)"
                rows={3}
                placeholder="Anything else our reviewers should know…"
                id="sig-notes"
              />

              <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-caption text-text-muted">
                  By submitting you confirm this concerns public content.
                </p>
                <Button variant="primary" type="submit">
                  Submit for review
                </Button>
              </div>
            </form>
          </Card>

          <div className="space-y-4">
            {assurances.map((a) => {
              const Icon = a.icon;
              return (
                <Card key={a.title} className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-verified/15 text-verified">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-body-sm font-semibold text-text-primary">
                      {a.title}
                    </h3>
                    <p className="mt-0.5 text-caption text-text-secondary">{a.body}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </Section>
    </>
  );
}

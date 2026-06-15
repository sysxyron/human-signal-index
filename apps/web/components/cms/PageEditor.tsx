'use client';

// =============================================================================
// HSI Phase 31 — CMS page editor (client). Admin-only (the page server-gates +
// the DAL re-checks requireAdmin). Edit page meta + blocks, save draft, publish.
// Live validation via the pure @hsi/cms-engine. Block content is edited as JSON
// for flexibility across the 8 block types.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { Plus, Trash2, Save, Send, Loader2, Eye } from 'lucide-react';
import Link from 'next/link';
import { BLOCK_TYPES, defaultBlockContent, validatePage, type CmsBlock, type PageDraft, type PageType } from '@hsi/cms-engine';
import { saveDraft, publishPage } from '@/lib/cms/cms';

const PAGE_TYPES: PageType[] = ['landing', 'content', 'report', 'knowledge', 'legal', 'help'];
let tmp = 0;
const tmpId = () => `tmp_${tmp++}`;

export function PageEditor({ initial, isNew }: { initial: PageDraft; isNew: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.page.title);
  const [slug, setSlug] = useState(initial.page.slug);
  const [pageType, setPageType] = useState<PageType>(initial.page.pageType);
  const [seoTitle, setSeoTitle] = useState(initial.page.seo?.title ?? '');
  const [seoDesc, setSeoDesc] = useState(initial.page.seo?.description ?? '');
  const [blocks, setBlocks] = useState<CmsBlock[]>(initial.blocks.length ? initial.blocks : []);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const draft: PageDraft = {
    page: { ...initial.page, title, slug, pageType, status: initial.page.status, seo: { title: seoTitle, description: seoDesc } },
    blocks,
  };
  const validation = validatePage(draft);

  function setBlockContent(id: string, json: string) {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, content: safeParse(json, b.content) } : b)));
  }
  function setBlockType(id: string, type: CmsBlock['type']) {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, type, content: defaultBlockContent(type) } : b)));
  }
  function addBlock() {
    setBlocks((bs) => [...bs, { id: tmpId(), type: 'rich_text', position: bs.length, content: defaultBlockContent('rich_text') }]);
  }
  function removeBlock(id: string) { setBlocks((bs) => bs.filter((b) => b.id !== id)); }

  function persist(publish: boolean) {
    setMsg(null);
    startTransition(async () => {
      const save = await saveDraft({ id: isNew ? undefined : initial.page.id, slug, pageType, title, seo: { title: seoTitle, description: seoDesc }, blocks });
      if (!save.ok) { setMsg({ ok: false, text: save.error ?? 'Save failed.' }); return; }
      if (publish) {
        const pub = await publishPage(save.data.id);
        if (!pub.ok) { setMsg({ ok: false, text: pub.error ?? 'Publish failed.' }); return; }
        setMsg({ ok: true, text: 'Published.' });
      } else {
        setMsg({ ok: true, text: 'Draft saved.' });
      }
      router.refresh();
      if (isNew && save.ok) router.push(`/dashboard/admin/cms/pages/${save.data.id}` as never);
    });
  }

  return (
    <div className="space-y-5">
      <Card className="grid gap-3 border-border sm:grid-cols-2" padded>
        <label className="space-y-1"><span className="text-label text-text-muted">Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" /></label>
        <label className="space-y-1"><span className="text-label text-text-muted">Slug</span><input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="about" className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" /></label>
        <label className="space-y-1"><span className="text-label text-text-muted">Page type</span>
          <select value={pageType} onChange={(e) => setPageType(e.target.value as PageType)} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary">{PAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        </label>
        <label className="space-y-1"><span className="text-label text-text-muted">SEO title</span><input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" /></label>
        <label className="space-y-1 sm:col-span-2"><span className="text-label text-text-muted">SEO description</span><input value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" /></label>
      </Card>

      <div className="space-y-3">
        {blocks.map((b, i) => (
          <Card key={b.id} className="space-y-2 border-border" padded>
            <div className="flex items-center justify-between gap-2">
              <span className="text-label uppercase tracking-wide text-text-muted">Block {i + 1}</span>
              <div className="flex items-center gap-2">
                <select value={b.type} onChange={(e) => setBlockType(b.id, e.target.value as CmsBlock['type'])} className="rounded-card border border-border bg-surface px-2 py-1 text-label text-text-primary">{BLOCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                <button type="button" onClick={() => removeBlock(b.id)} className="text-text-muted hover:text-error"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <textarea defaultValue={JSON.stringify(b.content, null, 2)} onChange={(e) => setBlockContent(b.id, e.target.value)} rows={5} spellCheck={false} className="w-full rounded-card border border-border bg-surface px-3 py-2 font-mono text-label text-text-primary" />
          </Card>
        ))}
        <Button onClick={addBlock}><Plus className="h-4 w-4" /> Add block</Button>
      </div>

      {!validation.ok ? (
        <Card className="space-y-1 border-warning/40 bg-warning/10" padded>
          <p className="text-caption font-semibold text-warning">Not publish-ready:</p>
          {validation.issues.slice(0, 8).map((iss, i) => <p key={i} className="text-label text-warning">• {iss.message}</p>)}
        </Card>
      ) : null}

      {msg ? <div className={`rounded-card border px-4 py-2.5 text-caption ${msg.ok ? 'border-success/40 bg-success/10 text-success' : 'border-error/40 bg-error/10 text-error'}`}>{msg.text}</div> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => persist(false)} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft</Button>
        <Button onClick={() => persist(true)} disabled={pending || !validation.ok}><Send className="h-4 w-4" /> Publish</Button>
        {!isNew ? <Link href={`/p/${slug}` as never} target="_blank" className="inline-flex items-center gap-1.5 text-caption text-electric hover:underline"><Eye className="h-3.5 w-3.5" /> Preview public page</Link> : null}
      </div>
    </div>
  );
}

function safeParse(s: string, fallback: Record<string, unknown>): Record<string, unknown> {
  try { const v = JSON.parse(s); return v && typeof v === 'object' ? v as Record<string, unknown> : fallback; } catch { return fallback; }
}

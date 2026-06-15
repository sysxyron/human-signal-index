// =============================================================================
// HSI Phase 31 — public CMS page renderer (/p/[slug]). Renders a PUBLISHED CMS
// page's blocks (Deliverable 21). Per-page SEO via generateMetadata (Deliverable
// 22). If the page isn't published (or no DB), shows a graceful fallback — CMS
// content is additive and never breaks the site. No auth required (public).
// =============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import type { CmsBlock } from '@hsi/cms-engine';
import { getPublishedPage } from '@/lib/cms/cms';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = await getPublishedPage(params.slug);
  if (!page) return { title: 'Human Signal Index' };
  return {
    title: page.seo.title,
    description: page.seo.description,
    keywords: page.page.seo?.keywords,
    openGraph: { title: page.seo.title, description: page.seo.description, images: page.page.seo?.ogImage ? [page.page.seo.ogImage] : undefined },
  };
}

function s(v: unknown): string { return typeof v === 'string' ? v : ''; }

function Block({ block }: { block: CmsBlock }) {
  const c = block.content ?? {};
  switch (block.type) {
    case 'hero':
      return (
        <section className="space-y-3 py-8 text-center">
          <h1 className="text-h2 font-bold text-text-primary">{s(c.heading)}</h1>
          {s(c.subheading) ? <p className="mx-auto max-w-2xl text-body text-text-secondary">{s(c.subheading)}</p> : null}
          {s(c.ctaLabel) && s(c.ctaHref) ? <Link href={s(c.ctaHref) as never} className="inline-block rounded-card bg-electric px-5 py-2.5 text-caption font-semibold text-white">{s(c.ctaLabel)}</Link> : null}
        </section>
      );
    case 'rich_text':
      return <div className="prose prose-invert max-w-none whitespace-pre-wrap text-body text-text-secondary">{s(c.markdown)}</div>;
    case 'image':
      // eslint-disable-next-line @next/next/no-img-element
      return s(c.url) ? <img src={s(c.url)} alt={s(c.alt)} className="mx-auto rounded-card" /> : null;
    case 'quote':
      return <blockquote className="border-l-2 border-electric pl-4 text-body italic text-text-secondary">“{s(c.text)}”{s(c.attribution) ? <footer className="mt-1 text-caption text-text-muted">— {s(c.attribution)}</footer> : null}</blockquote>;
    case 'cta':
      return s(c.href) ? <div className="text-center"><Link href={s(c.href) as never} className="inline-block rounded-card bg-electric px-5 py-2.5 text-caption font-semibold text-white">{s(c.label) || 'Learn more'}</Link></div> : null;
    case 'divider':
      return <hr className="border-border" />;
    case 'faq': {
      const items = Array.isArray(c.items) ? (c.items as Array<{ q?: string; a?: string }>) : [];
      return <dl className="space-y-3">{items.map((it, i) => <div key={i}><dt className="font-semibold text-text-primary">{s(it.q)}</dt><dd className="text-text-secondary">{s(it.a)}</dd></div>)}</dl>;
    }
    case 'card_grid': {
      const cards = Array.isArray(c.cards) ? (c.cards as Array<{ title?: string; body?: string }>) : [];
      return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map((cd, i) => <div key={i} className="rounded-card border border-border p-4"><div className="font-semibold text-text-primary">{s(cd.title)}</div><div className="mt-1 text-caption text-text-secondary">{s(cd.body)}</div></div>)}</div>;
    }
  }
}

export default async function PublicCmsPage({ params }: { params: { slug: string } }) {
  const page = await getPublishedPage(params.slug);
  if (!page) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-8 text-center">
        <h1 className="text-h3 font-bold text-text-primary">Page not available</h1>
        <p className="text-body text-text-secondary">This content isn’t published yet.</p>
        <Link href={"/" as never} className="text-electric hover:underline">← Back to home</Link>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 lg:p-10">
      {page.blocks.map((b) => <Block key={b.id} block={b} />)}
    </main>
  );
}

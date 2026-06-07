import { type ReactNode } from 'react';
import { SectionEyebrow } from '@hsi/ui';

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-50" />
      <div className="relative mx-auto max-w-section px-6 py-16 lg:py-20">
        <div className="max-w-2xl space-y-4">
          <SectionEyebrow>{eyebrow}</SectionEyebrow>
          <h1 className="text-h3 font-bold tracking-tight lg:text-h2">{title}</h1>
          {description ? (
            <p className="text-body-lg text-text-secondary">{description}</p>
          ) : null}
          {children}
        </div>
      </div>
    </section>
  );
}

export function Section({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mx-auto max-w-section px-6 py-12 lg:py-16 ${className}`}>
      {children}
    </section>
  );
}

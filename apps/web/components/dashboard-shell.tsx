import { type ReactNode } from 'react';
import { TopNav } from '@hsi/ui';

/** Wraps a dashboard sub-page with the shared TopNav + padded main. */
export function DashboardPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <TopNav title={title} subtitle={subtitle} />
      <main className="space-y-6 p-5 lg:p-6">
        {actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
        {children}
      </main>
    </>
  );
}

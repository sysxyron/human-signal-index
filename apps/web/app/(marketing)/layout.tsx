import { PublicNav, Footer } from '@hsi/ui';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}

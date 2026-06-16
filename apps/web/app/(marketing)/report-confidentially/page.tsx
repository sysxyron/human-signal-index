import { PageHeader, Section } from '../../../components/page-header';
import { ConfidentialReportForm } from '../../../components/security/ConfidentialReportForm';

import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Report Confidentially',
  description:
    'A confidential channel to report wrongdoing, security problems, or abuse to Human Signal Index. Every submission is reviewed by a person.',
  alternates: { canonical: '/report-confidentially' },
};

export default function ReportConfidentiallyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Confidential Reporting"
        title="Tell us, confidentially."
        description="Use this channel to report wrongdoing, security problems, or abuse. You will get a reference code to track your report. A person reviews every submission, with no automated decisions."
      />
      <Section>
        <ConfidentialReportForm />
      </Section>
    </>
  );
}

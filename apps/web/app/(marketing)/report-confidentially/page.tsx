import { PageHeader, Section } from '../../../components/page-header';
import { ConfidentialReportForm } from '../../../components/security/ConfidentialReportForm';

export const metadata = { title: 'Report Confidentially' };

export default function ReportConfidentiallyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Confidential Reporting"
        title="Tell us, confidentially."
        description="Use this channel to report wrongdoing, security problems, or abuse. You will get a reference code to track your report. A person reviews every submission — there are no automated decisions."
      />
      <Section>
        <ConfidentialReportForm />
      </Section>
    </>
  );
}

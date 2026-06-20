'use client';
// =============================================================================
// HSI Phase 73.2 — PDF export stub (client). Disabled until a reporting phase
// wires PDF generation. The report data shape (PlatformAuditReport) is already
// PDF-ready. No-op today.
// =============================================================================

import { Button } from '@hsi/ui';
import { FileDown } from 'lucide-react';

export function PdfExportButton() {
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" disabled aria-disabled title="PDF export will be enabled in a future reporting phase.">
        <FileDown className="h-3.5 w-3.5" /> Export PDF Report
      </Button>
      <span className="text-[10px] text-text-muted">PDF export will be enabled in a future reporting phase.</span>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { DashboardPage } from '../../../components/dashboard-shell';
import {
  Card,
  Button,
  MetricCard,
  EvidenceDrawer,
  Table,
  TraceabilityBadge,
  type TableColumn,
} from '@hsi/ui';
import { Archive, FileCheck2, Hash, Lock } from 'lucide-react';

interface VaultRow {
  id: string;
  passage: string;
  source: string;
  hash: string;
  trace: number;
  captured: string;
}

const items: VaultRow[] = [
  { id: '1', passage: 'They don\'t want you to see this before the window closes…', source: 'telegram/channel-x', hash: '0x9af3…b21c', trace: 94, captured: '2h ago' },
  { id: '2', passage: 'Official sources are lying — here is the real data.', source: 'x.com/handle', hash: '0x44de…91aa', trace: 88, captured: '3h ago' },
  { id: '3', passage: 'Share with 10 people in the next hour.', source: 'fb.com/page', hash: '0x7c0a…f3e2', trace: 91, captured: '5h ago' },
  { id: '4', passage: 'Internal memo confirms the suppression effort.', source: 'reddit/r/x', hash: '0x1b88…cc40', trace: 73, captured: '8h ago' },
];

const drawerItems = items.map((i) => ({
  passage: i.passage,
  source: i.source,
  capturedAt: i.captured,
  hash: i.hash,
}));

export default function EvidenceVaultPage() {
  const [open, setOpen] = useState(false);

  const columns: TableColumn<VaultRow>[] = [
    { key: 'passage', header: 'Archived passage', render: (r) => <span className="text-text-primary">“{r.passage}”</span> },
    { key: 'source', header: 'Source', render: (r) => <span className="text-text-secondary">{r.source}</span> },
    { key: 'hash', header: 'Integrity hash', render: (r) => <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">{r.hash}</span> },
    { key: 'trace', header: 'Traceability', align: 'right', render: (r) => <TraceabilityBadge score={r.trace} /> },
  ];

  return (
    <DashboardPage
      title="Evidence Vault"
      subtitle="Tamper-evident archive of captured evidence"
      actions={<Button variant="primary" size="sm" onClick={() => setOpen(true)}>Open vault drawer</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Archived Items" value="412,908" accent="#3B82F6" icon={Archive} delta={{ value: '+1,204', trend: 'up' }} />
        <MetricCard label="Integrity Verified" value="99.98%" accent="#10B981" icon={FileCheck2} />
        <MetricCard label="Hashes Sealed" value="412,824" accent="#8B5CF6" icon={Hash} />
        <MetricCard label="Encrypted at Rest" value="100%" accent="#F59E0B" icon={Lock} />
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-h6 font-semibold text-text-primary">Recent evidence</h3>
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Inspect</Button>
        </div>
        <Table columns={columns} data={items} rowKey={(r) => r.id} />
      </Card>

      <EvidenceDrawer
        open={open}
        onClose={() => setOpen(false)}
        items={drawerItems}
        footer={<Button variant="primary" className="w-full">Export evidence bundle</Button>}
      />
    </DashboardPage>
  );
}

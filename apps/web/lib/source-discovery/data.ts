// =============================================================================
// HSI Phase 70.3 — Source discovery dashboard data (SERVER-ONLY, reviewer+ read).
// Import batches, candidate queues (pending / duplicate / approved / rejected),
// signal candidates, and discovery runs. All computed. Never throws.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import {
  listBatchesDal, listCandidatesDal, listSignalCandidatesDal, listRunsDal,
  listInvalidRowsDal, listSeedsDal, getRegistryStatisticsDal,
  type BatchRow, type CandidateRecord, type SignalCandidateRow, type RunRow,
  type InvalidRowRecord, type SeedRow, type RegistryStatistics,
} from './persistence';

export interface SourceDiscoveryDashboard {
  batches: BatchRow[];
  pending: CandidateRecord[];
  duplicates: CandidateRecord[];
  approved: CandidateRecord[];
  rejected: CandidateRecord[];
  signalCandidates: SignalCandidateRow[];
  runs: RunRow[];
  invalidRows: InvalidRowRecord[];
  seeds: SeedRow[];
  statistics: RegistryStatistics;
  counts: { pending: number; duplicates: number; approved: number; rejected: number; signals: number };
}

export async function getSourceDiscoveryDashboard(): Promise<SourceDiscoveryDashboard> {
  const db = createClient();
  const [batches, pending, duplicates, approved, rejected, signalCandidates, runs, invalidRows, seeds, statistics] = await Promise.all([
    listBatchesDal(db, 20),
    listCandidatesDal(db, 'pending_review', 100),
    listCandidatesDal(db, 'duplicate', 50),
    listCandidatesDal(db, 'approved', 50),
    listCandidatesDal(db, 'rejected', 50),
    listSignalCandidatesDal(db, 'pending_review', 100),
    listRunsDal(db, 20),
    listInvalidRowsDal(db, 50),
    listSeedsDal(db),
    getRegistryStatisticsDal(db),
  ]);
  return {
    batches, pending, duplicates, approved, rejected, signalCandidates, runs, invalidRows, seeds, statistics,
    counts: { pending: pending.length, duplicates: duplicates.length, approved: approved.length, rejected: rejected.length, signals: signalCandidates.length },
  };
}

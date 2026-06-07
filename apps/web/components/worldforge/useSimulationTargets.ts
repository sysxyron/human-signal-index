'use client';

// =============================================================================
// WorldForge — client hook to load the available save-target simulations.
// Used by the scenarios / counterfactuals / timelines / provenance pages (which
// are client components) so they can pick a simulation to persist against.
// Loads via a server action on mount; degrades gracefully on error.
// =============================================================================

import { useEffect, useState } from 'react';
import type { SimulationRecord } from '@hsi/shared-types';
import { listSimulationsAction } from '@/app/dashboard/worldforge/actions';

export interface SimulationTargets {
  simulations: SimulationRecord[];
  loading: boolean;
  error: string | null;
  selectedId: string;
  setSelectedId: (id: string) => void;
}

export function useSimulationTargets(): SimulationTargets {
  const [simulations, setSimulations] = useState<SimulationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    listSimulationsAction()
      .then((res) => {
        if (!active) return;
        if (res.ok) {
          setSimulations(res.data);
          setSelectedId((cur) => cur || res.data[0]?.id || '');
        } else {
          setError(res.error);
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { simulations, loading, error, selectedId, setSelectedId };
}

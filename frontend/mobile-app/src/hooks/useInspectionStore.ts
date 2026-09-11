import { useCallback, useEffect, useMemo, useState } from 'react';

import { getAllInspections, getInspectionCount, type InspectionRow } from '@/services/db';

export type InspectionSummary = {
  total: number;
  synced: number;
  pending: number;
};

export function useInspectionStore() {
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [summary, setSummary] = useState<InspectionSummary>({ total: 0, synced: 0, pending: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [rows, total] = await Promise.all([getAllInspections(), getInspectionCount()]);
      const pending = rows.filter((row) => row.sync_status === 'PENDING').length;

      setInspections(rows);
      setSummary({
        total,
        synced: Math.max(0, total - pending),
        pending,
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load inspection records.';
      setError(message);
      setInspections([]);
      setSummary({ total: 0, synced: 0, pending: 0 });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasData = useMemo(() => inspections.length > 0, [inspections.length]);

  return {
    inspections,
    summary,
    isLoading,
    error,
    hasData,
    refresh,
  };
}

export default useInspectionStore;
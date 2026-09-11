import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import { getPendingInspections, markAsSynced, type InspectionRow } from './db';

export type InspectionSyncResult = {
  pendingCount: number;
  syncedCount: number;
  failedCount: number;
  syncedIds: string[];
};

export type SyncEngineOptions = {
  baseUrl: string;
  batchPath?: string;
  autoStart?: boolean;
  onSyncComplete?: (result: InspectionSyncResult) => void;
  onSyncError?: (error: Error) => void;
};

const DEFAULT_BATCH_PATH = '/api/v1/inspections/batch';

let syncInFlight: Promise<InspectionSyncResult> | null = null;

const normalizeBaseUrl = (baseUrl: string) => String(baseUrl ?? '').trim().replace(/\/+$/, '');

const buildBatchUrl = (baseUrl: string, batchPath?: string) => {
  const path = batchPath ?? DEFAULT_BATCH_PATH;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizeBaseUrl(baseUrl)}${normalizedPath}`;
};

const extractSyncedIds = (responseBody: unknown, fallback: InspectionRow[]) => {
  if (!responseBody || typeof responseBody !== 'object') {
    return fallback.map((record) => record.id);
  }

  const candidate = responseBody as Record<string, unknown>;
  const directLists = [candidate.synced_ids, candidate.accepted_ids, candidate.saved_ids, candidate.ids];

  for (const value of directLists) {
    if (Array.isArray(value)) {
      const ids = value.map((entry) => String(entry).trim()).filter(Boolean);
      if (ids.length > 0) {
        return ids;
      }
    }
  }

  if (Array.isArray(candidate.results)) {
    const ids = candidate.results
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
      .filter((entry) => entry.status === 'SYNCED' || entry.status === 'SUCCESS' || entry.success === true)
      .map((entry) => String(entry.id ?? entry.inspection_id ?? '').trim())
      .filter(Boolean);

    if (ids.length > 0) {
      return ids;
    }
  }

  if (candidate.success === true || candidate.ok === true) {
    return fallback.map((record) => record.id);
  }

  return [];
};

const parseResponseBody = async (response: Response) => {
  const raw = await response.text();

  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

export async function syncPendingInspections(options: SyncEngineOptions): Promise<InspectionSyncResult> {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    const pendingInspections = await getPendingInspections();
    if (pendingInspections.length === 0) {
      return {
        pendingCount: 0,
        syncedCount: 0,
        failedCount: 0,
        syncedIds: [],
      };
    }

    const response = await fetch(buildBatchUrl(options.baseUrl, options.batchPath), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pendingInspections),
    });

    const responseBody = await parseResponseBody(response);

    if (!response.ok) {
      const message = typeof responseBody === 'string'
        ? responseBody
        : (responseBody && typeof responseBody === 'object' && 'message' in responseBody)
          ? String((responseBody as { message?: unknown }).message ?? `Inspection batch sync failed (${response.status})`)
          : `Inspection batch sync failed (${response.status})`;

      throw new Error(message);
    }

    const syncedIds = extractSyncedIds(responseBody, pendingInspections);
    const syncedCount = syncedIds.length > 0 ? await markAsSynced(syncedIds) : 0;

    return {
      pendingCount: pendingInspections.length,
      syncedCount,
      failedCount: Math.max(0, pendingInspections.length - syncedCount),
      syncedIds,
    };
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

export function startInspectionSyncEngine(options: SyncEngineOptions) {
  if (options.autoStart === false) {
    return () => undefined;
  }

  let isDisposed = false;

  const trySync = async (state: NetInfoState) => {
    if (isDisposed) {
      return;
    }

    if (!state.isConnected || state.isInternetReachable === false) {
      return;
    }

    try {
      const result = await syncPendingInspections(options);
      options.onSyncComplete?.(result);
    } catch (error) {
      const syncError = error instanceof Error ? error : new Error('Inspection sync failed unexpectedly.');
      options.onSyncError?.(syncError);
    }
  };

  const unsubscribe = NetInfo.addEventListener((state) => {
    void trySync(state);
  });

  void NetInfo.fetch().then(trySync).catch((error) => {
    const syncError = error instanceof Error ? error : new Error('Unable to query network state.');
    options.onSyncError?.(syncError);
  });

  return () => {
    isDisposed = true;
    unsubscribe();
  };
}

export function createInspectionSyncEngine(options: SyncEngineOptions) {
  return {
    syncPendingInspections: () => syncPendingInspections(options),
    start: () => startInspectionSyncEngine(options),
  };
}

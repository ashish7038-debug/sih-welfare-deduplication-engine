import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import { generateInspectionHash, type InspectionHashInput } from '@/utils/crypto';

export type InspectionSourceType = 'LIVE_SCAN' | 'MANUAL_UPLOAD';
export type InspectionSyncStatus = 'PENDING' | 'SYNCED';

export type InspectionRow = {
  id: string;
  road_id: string;
  source_type: InspectionSourceType;
  latitude: number;
  longitude: number;
  altitude: number | null;
  speed: number | null;
  accel_x: number | null;
  accel_y: number | null;
  accel_z: number | null;
  peak_g_force: number;
  pci_score: number;
  inspection_hash: string;
  sync_status: InspectionSyncStatus;
  created_at: string;
};

export type SaveInspectionInput = Omit<InspectionRow, 'id' | 'inspection_hash' | 'sync_status' | 'created_at'> & {
  id?: string;
  inspection_hash?: string;
  sync_status?: InspectionSyncStatus;
  created_at?: string;
};

const DATABASE_NAME = 'roadshield-ai.db';

const CREATE_INSPECTIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS inspections (
    id TEXT PRIMARY KEY NOT NULL,
    road_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('LIVE_SCAN', 'MANUAL_UPLOAD')),
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude REAL,
    speed REAL,
    accel_x REAL,
    accel_y REAL,
    accel_z REAL,
    peak_g_force REAL NOT NULL,
    pci_score REAL NOT NULL,
    inspection_hash TEXT NOT NULL UNIQUE,
    sync_status TEXT NOT NULL CHECK (sync_status IN ('PENDING', 'SYNCED')),
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_inspections_sync_status ON inspections(sync_status);
  CREATE INDEX IF NOT EXISTS idx_inspections_created_at ON inspections(created_at);
  CREATE INDEX IF NOT EXISTS idx_inspections_road_id ON inspections(road_id);
`;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const normalizeSourceType = (value: string): InspectionSourceType => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'MANUAL_UPLOAD' ? 'MANUAL_UPLOAD' : 'LIVE_SCAN';
};

const normalizeSyncStatus = (value: string | undefined): InspectionSyncStatus => {
  const normalized = String(value ?? 'PENDING').trim().toUpperCase();
  return normalized === 'SYNCED' ? 'SYNCED' : 'PENDING';
};

const toStableNumber = (value: number | string | null | undefined, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNullableNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync(CREATE_INSPECTIONS_TABLE_SQL);
      return db;
    })();
  }

  return databasePromise;
}

const createInspectionHashInput = (input: SaveInspectionInput, createdAt: string): InspectionHashInput => ({
  roadId: input.road_id,
  latitude: input.latitude,
  longitude: input.longitude,
  accelZPeak: input.accel_z ?? input.peak_g_force,
  pciScore: input.pci_score,
  timestamp: createdAt,
  sourceType: input.source_type,
});

const normalizeInspectionRow = async (input: SaveInspectionInput): Promise<InspectionRow> => {
  const createdAt = input.created_at ?? new Date().toISOString();
  const inspectionHash = input.inspection_hash ?? (await generateInspectionHash(createInspectionHashInput(input, createdAt)));

  return {
    id: input.id ?? Crypto.randomUUID(),
    road_id: String(input.road_id).trim(),
    source_type: normalizeSourceType(input.source_type),
    latitude: toStableNumber(input.latitude),
    longitude: toStableNumber(input.longitude),
    altitude: toNullableNumber(input.altitude),
    speed: toNullableNumber(input.speed),
    accel_x: toNullableNumber(input.accel_x),
    accel_y: toNullableNumber(input.accel_y),
    accel_z: toNullableNumber(input.accel_z),
    peak_g_force: toStableNumber(input.peak_g_force),
    pci_score: toStableNumber(input.pci_score),
    inspection_hash: inspectionHash,
    sync_status: normalizeSyncStatus(input.sync_status),
    created_at: createdAt,
  };
};

export async function saveInspection(input: SaveInspectionInput): Promise<InspectionRow> {
  const db = await getDatabase();
  const record = await normalizeInspectionRow(input);

  await db.runAsync(
    `
      INSERT INTO inspections (
        id,
        road_id,
        source_type,
        latitude,
        longitude,
        altitude,
        speed,
        accel_x,
        accel_y,
        accel_z,
        peak_g_force,
        pci_score,
        inspection_hash,
        sync_status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        road_id = excluded.road_id,
        source_type = excluded.source_type,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        altitude = excluded.altitude,
        speed = excluded.speed,
        accel_x = excluded.accel_x,
        accel_y = excluded.accel_y,
        accel_z = excluded.accel_z,
        peak_g_force = excluded.peak_g_force,
        pci_score = excluded.pci_score,
        inspection_hash = excluded.inspection_hash,
        sync_status = excluded.sync_status,
        created_at = excluded.created_at
    `,
    [
      record.id,
      record.road_id,
      record.source_type,
      record.latitude,
      record.longitude,
      record.altitude,
      record.speed,
      record.accel_x,
      record.accel_y,
      record.accel_z,
      record.peak_g_force,
      record.pci_score,
      record.inspection_hash,
      record.sync_status,
      record.created_at,
    ],
  );

  return record;
}

export async function getPendingInspections(): Promise<InspectionRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<InspectionRow>(
    `
      SELECT
        id,
        road_id,
        source_type,
        latitude,
        longitude,
        altitude,
        speed,
        accel_x,
        accel_y,
        accel_z,
        peak_g_force,
        pci_score,
        inspection_hash,
        sync_status,
        created_at
      FROM inspections
      WHERE sync_status = 'PENDING'
      ORDER BY created_at ASC
    `,
  );
}

export async function markAsSynced(ids: string[]): Promise<number> {
  const normalizedIds = ids.map((id) => String(id).trim()).filter(Boolean);

  if (normalizedIds.length === 0) {
    return 0;
  }

  const db = await getDatabase();
  const placeholders = normalizedIds.map(() => '?').join(', ');

  await db.runAsync(
    `UPDATE inspections SET sync_status = 'SYNCED' WHERE id IN (${placeholders})`,
    normalizedIds,
  );

  return normalizedIds.length;
}

export async function resetInspectionSyncStatus(ids: string[]): Promise<number> {
  const normalizedIds = ids.map((id) => String(id).trim()).filter(Boolean);

  if (normalizedIds.length === 0) {
    return 0;
  }

  const db = await getDatabase();
  const placeholders = normalizedIds.map(() => '?').join(', ');

  await db.runAsync(
    `UPDATE inspections SET sync_status = 'PENDING' WHERE id IN (${placeholders})`,
    normalizedIds,
  );

  return normalizedIds.length;
}

export async function clearInspectionStore(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM inspections');
}

export async function getAllInspections(): Promise<InspectionRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<InspectionRow>(
    `
      SELECT
        id,
        road_id,
        source_type,
        latitude,
        longitude,
        altitude,
        speed,
        accel_x,
        accel_y,
        accel_z,
        peak_g_force,
        pci_score,
        inspection_hash,
        sync_status,
        created_at
      FROM inspections
      ORDER BY created_at DESC
    `,
  );
}

export async function getInspectionCount(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM inspections');
  return Number(result?.count ?? 0);
}

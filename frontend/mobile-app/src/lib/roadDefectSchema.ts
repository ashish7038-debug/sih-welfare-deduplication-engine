export const ROAD_DEFECT_CATEGORIES = [
  'pothole',
  'alligator_crack',
  'longitudinal_crack',
  'lateral_crack',
  'rutting',
] as const;

export type RoadDefectCategory = (typeof ROAD_DEFECT_CATEGORIES)[number];
export type DefectSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export const ROAD_DEFECT_TAXONOMY: Record<
  RoadDefectCategory,
  {
    label: string;
    defaultSeverity: DefectSeverity;
    deductValues: Record<DefectSeverity, number>;
  }
> = {
  pothole: {
    label: 'Pothole',
    defaultSeverity: 'MEDIUM',
    deductValues: { LOW: 10, MEDIUM: 25, HIGH: 45 },
  },
  alligator_crack: {
    label: 'Alligator crack',
    defaultSeverity: 'MEDIUM',
    deductValues: { LOW: 15, MEDIUM: 30, HIGH: 50 },
  },
  longitudinal_crack: {
    label: 'Longitudinal crack',
    defaultSeverity: 'MEDIUM',
    deductValues: { LOW: 5, MEDIUM: 15, HIGH: 30 },
  },
  lateral_crack: {
    label: 'Lateral crack',
    defaultSeverity: 'MEDIUM',
    deductValues: { LOW: 5, MEDIUM: 10, HIGH: 25 },
  },
  rutting: {
    label: 'Rutting',
    defaultSeverity: 'MEDIUM',
    deductValues: { LOW: 20, MEDIUM: 35, HIGH: 60 },
  },
};

export const SQLITE_SCHEMA = {
  inspections: `
    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      pci_score INTEGER NOT NULL CHECK (pci_score BETWEEN 0 AND 100),
      sync_status TEXT NOT NULL CHECK(sync_status IN ('PENDING', 'SYNCED'))
    );
  `,
  detections: `
    CREATE TABLE IF NOT EXISTS detections (
      id TEXT PRIMARY KEY,
      inspection_id TEXT NOT NULL,
      class_name TEXT NOT NULL,
      confidence REAL NOT NULL,
      box_area_ratio REAL NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH')),
      deduct_value INTEGER NOT NULL,
      FOREIGN KEY (inspection_id) REFERENCES inspections(id)
    );
  `,
};

export const INSPECTION_SCHEMA = {
  tableName: 'inspections',
  fields: {
    id: 'UUID',
    timestamp: 'ISO8601',
    latitude: 'REAL',
    longitude: 'REAL',
    pci_score: 'INTEGER 0-100',
    sync_status: "TEXT: 'PENDING' | 'SYNCED'",
  },
  detections: {
    tableName: 'detections',
    fields: {
      id: 'UUID',
      inspection_id: 'FK',
      class_name: "TEXT: 'pothole' | 'alligator_crack' | 'longitudinal_crack' | 'lateral_crack' | 'rutting'",
      confidence: 'REAL',
      box_area_ratio: 'REAL',
      severity: "TEXT: 'LOW' | 'MEDIUM' | 'HIGH'",
      deduct_value: 'INTEGER',
    },
  },
};

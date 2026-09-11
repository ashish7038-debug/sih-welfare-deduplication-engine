import { saveInspection as saveInspectionRow, type InspectionSourceType } from '@/services/db';

export type Severity = 'Low' | 'Medium' | 'High';

export type InspectionRecord = {
  id: number;
  title: string;
  severity: Severity;
  location: string;
  gps: string;
  notes: string;
  createdAt: string;
  imageUri?: string;
  status: string;
};

const parseGps = (gps: string) => {
  const [latitude, longitude] = String(gps ?? '')
    .split(',')
    .map((value) => Number(value.trim()));

  return {
    latitude: Number.isFinite(latitude) ? latitude : 0,
    longitude: Number.isFinite(longitude) ? longitude : 0,
  };
};

const toSourceType = (status: string): InspectionSourceType => {
  return String(status).toLowerCase().includes('offline') ? 'LIVE_SCAN' : 'MANUAL_UPLOAD';
};

const toPciScore = (severity: Severity) => {
  if (severity === 'High') return 32;
  if (severity === 'Medium') return 68;
  return 92;
};

const toIsoTimestamp = (value: string) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return new Date().toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
    return normalized;
  }

  const parsed = Date.parse(normalized);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }

  return new Date().toISOString();
};

export async function saveInspection(record: InspectionRecord) {
  const { latitude, longitude } = parseGps(record.gps);

  await saveInspectionRow({
    road_id: record.title,
    source_type: toSourceType(record.status),
    latitude,
    longitude,
    altitude: null,
    speed: null,
    accel_x: null,
    accel_y: null,
    accel_z: null,
    peak_g_force: 0,
    pci_score: toPciScore(record.severity),
    sync_status: String(record.status).toLowerCase().includes('offline') ? 'PENDING' : 'SYNCED',
    created_at: toIsoTimestamp(record.createdAt),
  });
}

export async function submitInspectionToBackend(record: InspectionRecord) {
  const payload = {
    device_id: 'mobile-app',
    raw_input: `${record.title} | ${record.notes} | ${record.location} | ${record.gps}`,
    severity: record.severity.toLowerCase(),
    confidence: 0.9,
    source: 'mobile-app',
  };

  try {
    const response = await fetch('http://127.0.0.1:8001/api/scans', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn('Backend sync failed:', await response.text());
    }
  } catch (error) {
    console.warn('Backend not reachable; saving locally only:', error);
  }
}

export type InspectionSeverity = "low" | "medium" | "high" | "critical";

export type InspectionRecord = {
  id: number;
  segment: string;
  district: string;
  latitude: number;
  longitude: number;
  pciScore: number;
  defectType: string;
  severity: InspectionSeverity;
  confidence: number;
  distanceKm: number;
  status: string;
  date: string;
  deviceId: string;
};

export type DashboardSummary = {
  totalInspections: number;
  totalKilometers: number;
  criticalCases: number;
  defectCount: number;
};

export const defaultInspectionSeed: InspectionRecord[] = [
  {
    id: 101,
    segment: "Pune Ring Road - Sector 12",
    district: "Pune",
    latitude: 18.5204,
    longitude: 73.8567,
    pciScore: 58,
    defectType: "Pothole",
    severity: "high",
    confidence: 0.92,
    distanceKm: 8.4,
    status: "Needs repair",
    date: "2026-09-08",
    deviceId: "PN-044",
  },
  {
    id: 102,
    segment: "Nagpur Link Road",
    district: "Nagpur",
    latitude: 21.1458,
    longitude: 79.0882,
    pciScore: 74,
    defectType: "Crack",
    severity: "medium",
    confidence: 0.86,
    distanceKm: 5.7,
    status: "Monitor",
    date: "2026-09-07",
    deviceId: "NG-117",
  },
  {
    id: 103,
    segment: "Bengaluru Outer Ring",
    district: "Bengaluru",
    latitude: 13.0827,
    longitude: 77.592,
    pciScore: 31,
    defectType: "Raveling",
    severity: "critical",
    confidence: 0.95,
    distanceKm: 12.6,
    status: "Immediate action",
    date: "2026-09-06",
    deviceId: "BLR-030",
  },
  {
    id: 104,
    segment: "Indore State Highway 32",
    district: "Indore",
    latitude: 22.7196,
    longitude: 75.8577,
    pciScore: 67,
    defectType: "Patch repair",
    severity: "medium",
    confidence: 0.81,
    distanceKm: 9.3,
    status: "Scheduled maintenance",
    date: "2026-09-05",
    deviceId: "IND-221",
  },
  {
    id: 105,
    segment: "Hyderabad Banjara Road",
    district: "Hyderabad",
    latitude: 17.385,
    longitude: 78.4867,
    pciScore: 42,
    defectType: "Pothole",
    severity: "high",
    confidence: 0.9,
    distanceKm: 6.9,
    status: "Urgent repair",
    date: "2026-09-05",
    deviceId: "HYD-108",
  },
  {
    id: 106,
    segment: "Ahmedabad Tenth Ring",
    district: "Ahmedabad",
    latitude: 23.0225,
    longitude: 72.5714,
    pciScore: 81,
    defectType: "Edge failure",
    severity: "low",
    confidence: 0.75,
    distanceKm: 11.2,
    status: "Good condition",
    date: "2026-09-04",
    deviceId: "AMD-062",
  },
  {
    id: 107,
    segment: "Lucknow Canal Corridor",
    district: "Lucknow",
    latitude: 26.8467,
    longitude: 80.9462,
    pciScore: 26,
    defectType: "Alligator cracking",
    severity: "critical",
    confidence: 0.97,
    distanceKm: 14.1,
    status: "Severe distress",
    date: "2026-09-03",
    deviceId: "LKO-310",
  },
  {
    id: 108,
    segment: "Chennai East arterial",
    district: "Chennai",
    latitude: 13.0827,
    longitude: 80.2707,
    pciScore: 69,
    defectType: "Surface wear",
    severity: "medium",
    confidence: 0.82,
    distanceKm: 7.4,
    status: "Planned resurfacing",
    date: "2026-09-02",
    deviceId: "CHN-211",
  },
];

export function derivePciScore(severity: string, confidence: number): number {
  const normalized = severity.toLowerCase();
  const severityWeight = {
    low: 82,
    medium: 66,
    high: 47,
    critical: 29,
  };

  const base = severityWeight[normalized as keyof typeof severityWeight] ?? 60;
  return Math.max(10, Math.min(96, Math.round(base - confidence * 18)));
}

export function deriveSeverityFromPci(pciScore: number): InspectionSeverity {
  if (pciScore < 40) return "critical";
  if (pciScore < 55) return "high";
  if (pciScore < 70) return "medium";
  return "low";
}

export function getPciColor(pciScore: number): string {
  if (pciScore < 40) return "#ef4444";
  if (pciScore < 55) return "#f59e0b";
  if (pciScore < 70) return "#facc15";
  return "#22c55e";
}

export function getDashboardSummary(records: InspectionRecord[]): DashboardSummary {
  const totalInspections = records.length;
  const totalKilometers = records.reduce((sum, record) => sum + record.distanceKm, 0);
  const criticalCases = records.filter((record) => record.pciScore < 40).length;
  const defectCount = records.filter((record) => record.defectType).length;

  return {
    totalInspections,
    totalKilometers: Number(totalKilometers.toFixed(1)),
    criticalCases,
    defectCount,
  };
}

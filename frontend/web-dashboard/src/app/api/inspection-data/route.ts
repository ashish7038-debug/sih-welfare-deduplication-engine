import { NextResponse } from "next/server";
import {
  defaultInspectionSeed,
  derivePciScore,
  deriveSeverityFromPci,
  getDashboardSummary,
  type InspectionRecord,
} from "@/lib/dashboard-data";

const fallbackCoordinates = [
  [18.5204, 73.8567],
  [21.1458, 79.0882],
  [13.0827, 77.592],
  [22.7196, 75.8577],
  [17.385, 78.4867],
  [23.0225, 72.5714],
  [26.8467, 80.9462],
  [13.0827, 80.2707],
  [19.076, 72.8777],
  [12.9716, 77.5946],
] as const;

function normalizeBackendPayload(payload: any[] = []): InspectionRecord[] {
  return payload.map((item, index) => {
    const severity = String(item.severity ?? "medium");
    const confidence = Number(item.confidence ?? 0.8);
    const [latitude, longitude] = fallbackCoordinates[index % fallbackCoordinates.length];
    const pciScore = derivePciScore(severity, confidence);

    return {
      id: Number(item.id ?? index + 1),
      segment: item.segment ?? `Inspection Segment ${index + 1}`,
      district: item.district ?? "Municipal Zone",
      latitude,
      longitude,
      pciScore,
      defectType: item.defectType ?? (severity === "critical" ? "Pothole" : "Crack"),
      severity: deriveSeverityFromPci(pciScore),
      confidence,
      distanceKm: Number(item.distanceKm ?? 6 + (index % 5) * 1.7),
      status: item.status ?? "Needs review",
      date: item.date ?? new Date().toISOString().slice(0, 10),
      deviceId: item.deviceId ?? `device-${index + 1}`,
    };
  });
}

export async function GET() {
  const candidates = [
    process.env.BACKEND_API_URL,
    "http://127.0.0.1:8000",
    "http://localhost:8000",
  ].filter(Boolean) as string[];

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}/api/scans`, {
        cache: "no-store",
      });

      if (!response.ok) continue;

      const payload = await response.json();
      const inspections = normalizeBackendPayload(Array.isArray(payload) ? payload : []);
      const summary = getDashboardSummary(inspections);
      return NextResponse.json({ inspections, summary });
    } catch {
      // fall back to seed data if the backend is not available.
    }
  }

  const summary = getDashboardSummary(defaultInspectionSeed);
  return NextResponse.json({ inspections: defaultInspectionSeed, summary });
}

"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import type { InspectionRecord } from "@/lib/dashboard-data";
import { getPciColor } from "@/lib/dashboard-data";

const DEFAULT_CENTER: [number, number] = [22.5937, 78.9629];

function FitMapToData({ inspections }: { inspections: InspectionRecord[] }) {
  const map = useMap();

  useEffect(() => {
    if (!inspections.length) return;

    const bounds = inspections.reduce(
      (acc, record) => {
        acc[0].push([record.latitude, record.longitude]);
        return acc;
      },
      [[]] as [number[][]],
    );

    const [points] = bounds;
    if (points.length === 0) return;

    const latLngs = points as [number, number][];
    map.fitBounds(latLngs, { padding: [30, 30] });
  }, [map, inspections]);

  return null;
}

export function RoadDashboardMap({
  inspections,
  selectedId,
  onSelect,
}: {
  inspections: InspectionRecord[];
  selectedId: number | null;
  onSelect: (inspection: InspectionRecord) => void;
}) {
  return (
    <div className="h-[480px] w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-950/40">
      <MapContainer center={DEFAULT_CENTER} zoom={5} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitMapToData inspections={inspections} />

        {inspections.map((inspection) => {
          const isSelected = inspection.id === selectedId;

          return (
            <CircleMarker
              key={inspection.id}
              center={[inspection.latitude, inspection.longitude]}
              radius={isSelected ? 13 : 10}
              pathOptions={{
                color: getPciColor(inspection.pciScore),
                fillColor: getPciColor(inspection.pciScore),
                fillOpacity: 0.85,
                weight: isSelected ? 3 : 2,
              }}
              eventHandlers={{
                click: () => onSelect(inspection),
              }}
            >
              <Popup>
                <div className="space-y-2 text-sm text-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <strong>{inspection.segment}</strong>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                      PCI {inspection.pciScore}
                    </span>
                  </div>
                  <div>{inspection.defectType}</div>
                  <div className="text-xs text-slate-600">{inspection.district}</div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

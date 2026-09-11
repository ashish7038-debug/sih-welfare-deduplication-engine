"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { DashboardSummary, InspectionRecord } from "@/lib/dashboard-data";
import { getPciColor } from "@/lib/dashboard-data";

const RoadDashboardMap = dynamic(
  () => import('@/components/road-dashboard-map').then((module) => module.RoadDashboardMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[480px] items-center justify-center rounded-3xl border border-slate-800 bg-slate-950 text-sm text-slate-300">
        Loading inspection map...
      </div>
    ),
  },
);

const numberFormatter = new Intl.NumberFormat("en-IN");

const defaultSummary: DashboardSummary = {
  totalInspections: 0,
  totalKilometers: 0,
  criticalCases: 0,
  defectCount: 0,
};

export default function Home() {
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>(defaultSummary);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        const response = await fetch("/api/inspection-data", { cache: "no-store" });
        const data = await response.json();

        if (!isMounted) return;

        const nextInspections = data.inspections ?? [];
        setInspections(nextInspections);
        setSummary(data.summary ?? defaultSummary);
        setSelectedId(nextInspections[0]?.id ?? null);
      } catch {
        setInspections([]);
        setSummary(defaultSummary);
        setSelectedId(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedInspection = useMemo(
    () => inspections.find((inspection) => inspection.id === selectedId) ?? inspections[0] ?? null,
    [inspections, selectedId],
  );

  const summaryCards = [
    {
      label: "Total scanned km",
      value: `${numberFormatter.format(summary.totalKilometers ?? 0)} km`,
      accent: "from-emerald-500/20 to-emerald-500/5",
      text: "text-emerald-300",
    },
    {
      label: "Defect observations",
      value: numberFormatter.format(summary.defectCount ?? 0),
      accent: "from-violet-500/20 to-violet-500/5",
      text: "text-violet-300",
    },
    {
      label: "Critical repair cases",
      value: numberFormatter.format(summary.criticalCases ?? 0),
      accent: "from-rose-500/20 to-rose-500/5",
      text: "text-rose-300",
    },
    {
      label: "Inspection records",
      value: numberFormatter.format(summary.totalInspections ?? 0),
      accent: "from-sky-500/20 to-sky-500/5",
      text: "text-sky-300",
    },
  ];

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-6 py-4 text-sm text-slate-300 shadow-2xl shadow-slate-950/40">
          Loading municipal dashboard...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8 xl:px-12">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-6 shadow-2xl shadow-slate-950/40">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">Road intelligence dashboard</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white md:text-4xl">
                Municipal road inspection monitor
              </h1>
            </div>
            <div className="rounded-full border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-200">
              Live AI defect status
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-3xl border border-slate-800 bg-gradient-to-br ${card.accent} p-4 shadow-lg shadow-slate-950/20`}
            >
              <p className="text-sm text-slate-300">{card.label}</p>
              <p className={`mt-4 text-3xl font-bold ${card.text}`}>{card.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.7fr_0.9fr]">
          <div className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-2xl shadow-slate-950/30">
            <div className="flex items-center justify-between px-2">
              <div>
                <h2 className="text-lg font-semibold text-white">Inspection map</h2>
                <p className="text-sm text-slate-400">PCI-based defect clustering across monitored corridors</p>
              </div>
              <div className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {inspections.length} active points
              </div>
            </div>

            {inspections.length > 0 ? (
              <RoadDashboardMap inspections={inspections} selectedId={selectedId} onSelect={(next) => setSelectedId(next.id)} />
            ) : (
              <div className="flex h-[480px] items-center justify-center rounded-3xl border border-dashed border-slate-700 text-slate-400">
                No inspection data available.
              </div>
            )}
          </div>

          <aside className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/30">
            {selectedInspection ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Selected corridor</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">{selectedInspection.segment}</h3>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-950"
                    style={{ backgroundColor: getPciColor(selectedInspection.pciScore) }}
                  >
                    PCI {selectedInspection.pciScore}
                  </span>
                </div>

                <div className="mt-6 space-y-4 text-sm text-slate-300">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                    <div className="flex justify-between text-slate-400">
                      <span>District</span>
                      <span className="text-slate-200">{selectedInspection.district}</span>
                    </div>
                    <div className="mt-3 flex justify-between text-slate-400">
                      <span>Defect type</span>
                      <span className="text-slate-200">{selectedInspection.defectType}</span>
                    </div>
                    <div className="mt-3 flex justify-between text-slate-400">
                      <span>Severity</span>
                      <span className="capitalize text-slate-200">{selectedInspection.severity}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                    <div className="flex justify-between text-slate-400">
                      <span>Distance scanned</span>
                      <span className="text-slate-200">{selectedInspection.distanceKm} km</span>
                    </div>
                    <div className="mt-3 flex justify-between text-slate-400">
                      <span>AI confidence</span>
                      <span className="text-slate-200">{Math.round(selectedInspection.confidence * 100)}%</span>
                    </div>
                    <div className="mt-3 flex justify-between text-slate-400">
                      <span>Status</span>
                      <span className="text-slate-200">{selectedInspection.status}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                    <div className="flex justify-between text-slate-400">
                      <span>Coordinates</span>
                      <span className="text-slate-200">
                        {selectedInspection.latitude.toFixed(4)}, {selectedInspection.longitude.toFixed(4)}
                      </span>
                    </div>
                    <div className="mt-3 flex justify-between text-slate-400">
                      <span>Inspection ID</span>
                      <span className="text-slate-200">{selectedInspection.id}</span>
                    </div>
                    <div className="mt-3 flex justify-between text-slate-400">
                      <span>Device</span>
                      <span className="text-slate-200">{selectedInspection.deviceId}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">No inspection selected.</div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}

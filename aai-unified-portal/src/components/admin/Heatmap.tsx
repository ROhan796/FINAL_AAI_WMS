'use client';

import { useState, useEffect } from 'react';

const hours = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 === 0 ? 12 : i % 12;
  const ampm = i < 12 ? 'a' : 'p';
  return `${h}${ampm}`;
});

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const terminals = ['T1', 'T2', 'T3'];

function getIntensityStyle(val: number): string {
  if (val === 0) return 'bg-slate-100 border-slate-200';
  if (val < 20) return 'bg-emerald-100 border-emerald-200';
  if (val < 40) return 'bg-emerald-200 border-emerald-300';
  if (val < 60) return 'bg-amber-200 border-amber-300';
  if (val < 80) return 'bg-orange-300 border-orange-400';
  return 'bg-red-400 border-red-500';
}

function getIntensityLabel(val: number): string {
  if (val === 0) return 'No Data';
  if (val < 20) return 'Low';
  if (val < 40) return 'Moderate';
  if (val < 60) return 'Elevated';
  if (val < 80) return 'High';
  return 'Very High';
}

interface WashroomHourlyData {
  device_id: string;
  avg_occupancy: number;
  avg_whi: number;
}

interface HourlyHeatmapEntry {
  hour: number;
  washrooms: WashroomHourlyData[];
}

export default function Heatmap() {
  const [hourlyData, setHourlyData] = useState<HourlyHeatmapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchAllTerminals = async () => {
      try {
        const results = await Promise.all(
          terminals.map(async (t) => {
            const res = await fetch(
              `/api/wms/analytics/heatmap?terminal=${t}&level=L1&hours=24`,
              { cache: 'no-store' }
            );
            if (res.ok) {
              const data = await res.json();
              return Array.isArray(data) ? data : [];
            }
            return [];
          })
        );

        const merged: HourlyHeatmapEntry[] = [];
        for (let h = 0; h < 24; h++) {
          const washrooms: WashroomHourlyData[] = [];
          results.forEach((termData) => {
            const entry = termData.find((e: HourlyHeatmapEntry) => e.hour === h);
            if (entry?.washrooms) washrooms.push(...entry.washrooms);
          });
          merged.push({ hour: h, washrooms });
        }

        setHourlyData(merged);
        setError(results.every((r) => r.length === 0));
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchAllTerminals();
    const interval = setInterval(fetchAllTerminals, 60000);
    return () => clearInterval(interval);
  }, []);

  const grid: Record<string, number[]> = {};

  if (!loading && !error && hourlyData.length > 0) {
    days.forEach((day) => {
      grid[day] = hourlyData.map((entry) => {
        const avg = entry.washrooms.length > 0
          ? entry.washrooms.reduce((sum, w) => sum + w.avg_occupancy, 0) / entry.washrooms.length
          : 0;
        return Math.round(Math.min(100, avg));
      });
    });
  } else {
    days.forEach((day) => {
      grid[day] = Array.from({ length: 24 }, () => 0);
    });
  }

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-8">
        <div className="flex items-center gap-3 text-slate-400">
          <span className="animate-spin text-lg">⏳</span>
          <span className="text-sm">Loading heatmap data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-10 gap-3">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
          <span className="material-symbols-outlined text-slate-400">wifi_off</span>
        </div>
        <p className="text-sm text-slate-500 font-medium">WMS Backend not connected</p>
        <p className="text-xs text-slate-400 max-w-xs text-center">
          Start the WMS Backend to see real occupancy heatmap data across all terminals
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: '60px repeat(24, 1fr)' }}>
          <div></div>
          {hours.map((hour, idx) => (
            <div key={idx} className="text-[10px] text-center text-slate-400 font-semibold">
              {hour}
            </div>
          ))}

          {days.map((day) => (
            <div key={day} className="contents">
              <div className="text-xs font-semibold text-slate-600 flex items-center pr-2">
                {day}
              </div>
              {grid[day]?.map((val, idx) => (
                <div
                  key={idx}
                  className={`h-8 rounded-[3px] border transition-all hover:scale-110 hover:shadow-md cursor-pointer ${getIntensityStyle(val)}`}
                  title={`${day} ${hours[idx]}: ${getIntensityLabel(val)} (${val}%)`}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-6 px-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Intensity:</span>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-3 rounded-sm bg-slate-100 border border-slate-200"></span>
              <span className="text-[10px] text-slate-500 font-medium">None</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-3 rounded-sm bg-emerald-100 border border-emerald-200"></span>
              <span className="text-[10px] text-slate-500 font-medium">Low</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-3 rounded-sm bg-emerald-200 border border-emerald-300"></span>
              <span className="text-[10px] text-slate-500 font-medium">Moderate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-3 rounded-sm bg-amber-200 border border-amber-300"></span>
              <span className="text-[10px] text-slate-500 font-medium">Elevated</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-3 rounded-sm bg-orange-300 border border-orange-400"></span>
              <span className="text-[10px] text-slate-500 font-medium">High</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-3 rounded-sm bg-red-400 border border-red-500"></span>
              <span className="text-[10px] text-slate-500 font-medium">Very High</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface DAIncident {
  device_id: string;
  terminal: string;
  level: string;
  type: string;
  incident_type: string;
  severity: string;
  description: string;
  value: number;
  threshold: number;
  timestamp: string;
  whi: number;
}

interface WashroomDetail {
  device_id: string;
  terminal: string;
  level: string;
  type: string;
  whi: number;
  status: string;
  sensors: {
    nh3: number;
    h2s: number;
    temperature: number;
    humidity: number;
    occupancy_inside: number;
    throughput: number;
  };
  penalties: {
    nh3: number;
    h2s: number;
    humidity: number;
    temperature: number;
  };
  timestamp: string;
}

function IncidentDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deviceId = searchParams.get('device_id') || '';
  const incidentType = searchParams.get('type') || '';

  const [incident, setIncident] = useState<DAIncident | null>(null);
  const [washroom, setWashroom] = useState<WashroomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [incRes, whRes] = await Promise.all([
        fetch('/api/da/incidents', { cache: 'no-store' }),
        deviceId ? fetch(`/api/da/washrooms/${deviceId}`, { cache: 'no-store' }) : null,
      ]);

      if (incRes.ok) {
        const data = await incRes.json();
        const arr: DAIncident[] = Array.isArray(data) ? data : [];
        const match = arr.find(i =>
          i.device_id === deviceId && i.incident_type === incidentType
        ) || arr[0];
        if (match) setIncident(match);
      }

      if (whRes?.ok) {
        setWashroom(await whRes.json());
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [deviceId, incidentType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <LoadingSpinner text="Loading incident details..." />;

  if (!incident) {
    return (
      <div className="p-6 font-sans">
        <button
          onClick={() => router.push('/terminal/incidents')}
          className="text-blue-600 hover:underline flex items-center gap-1.5 text-xs font-bold bg-transparent border-none cursor-pointer"
        >
          Back to Incidents
        </button>
        <div className="mt-8 text-center text-slate-500">
          <p className="text-lg font-bold">Incident Not Found</p>
          <p className="text-sm mt-2">The requested incident data is not available.</p>
        </div>
      </div>
    );
  }

  const priority = incident.severity === 'CRITICAL' ? 'Critical' : incident.severity === 'WARNING' ? 'High' : 'Medium';
  const timestamp = new Date(incident.timestamp);
  const timeStr = timestamp.toLocaleTimeString();
  const dateStr = timestamp.toLocaleDateString();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in font-sans text-sm text-slate-700">
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`px-4 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                resolved ? 'bg-green-50 border-green-200 text-green-700' :
                incident.severity === 'CRITICAL' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-750'
              }`}>
                <span className={`w-2 h-2 rounded-full ${resolved ? 'bg-green-600' : 'bg-amber-600 animate-pulse'}`}></span>
                {resolved ? 'Resolved' : incident.severity === 'CRITICAL' ? 'Critical' : 'In Progress'}
              </span>
              <span className="text-slate-500 text-xs uppercase tracking-wider font-bold">Priority: {priority}</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900">{incident.description}: {incident.incident_type.replace(/_/g, ' ')}</h3>
            <p className="text-slate-655 text-xs max-w-xl leading-relaxed">
              Device {incident.device_id} reported {incident.incident_type.replace(/_/g, ' ').toLowerCase()} with value {incident.value?.toFixed(2)} (threshold: {incident.threshold}).
            </p>
          </div>
          <div className="flex flex-col gap-2 min-w-[200px] w-full md:w-auto">
            <button
              onClick={() => setResolved(prev => !prev)}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer border-none text-white ${
                resolved ? 'bg-slate-600 hover:bg-slate-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {resolved ? 'Reopen Incident' : 'Mark Resolved'}
            </button>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Device Sensor Readings</h4>
          {washroom ? (
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Ammonia (NH3)</span>
                <span className={`font-bold font-mono ${washroom.sensors.nh3 > 8 ? 'text-red-600' : 'text-slate-900'}`}>
                  {washroom.sensors.nh3?.toFixed(1)} PPM
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">H2S</span>
                <span className={`font-bold font-mono ${washroom.sensors.h2s > 500 ? 'text-red-600' : 'text-slate-900'}`}>
                  {washroom.sensors.h2s?.toFixed(1)} PPB
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Temperature</span>
                <span className="font-bold font-mono text-slate-900">{washroom.sensors.temperature?.toFixed(1)} C</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Humidity</span>
                <span className="font-bold font-mono text-slate-900">{washroom.sensors.humidity?.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">WHI Score</span>
                <span className={`font-bold font-mono ${washroom.whi < 60 ? 'text-red-600' : 'text-slate-900'}`}>
                  {Math.round(washroom.whi)}%
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Loading sensor data...</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 mb-6">Technical Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-xs">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Time Detected</p>
                <p className="text-xs text-slate-900 font-bold">{timeStr}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Date</p>
                <p className="text-xs text-slate-900 font-bold">{dateStr}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Device</p>
                <p className="text-xs text-slate-900 font-bold font-mono">{incident.device_id}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">WHI at Detection</p>
                <p className="text-xs text-red-655 font-bold">{Math.round(incident.whi)}%</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 mb-6">Incident Activity Log</h4>
            <div className="space-y-0 relative text-xs">
              <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-slate-200"></div>

              <div className="relative pl-10 pb-6">
                <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center z-10 text-blue-600 shadow-sm">
                  <span className="material-symbols-outlined text-[14px]">sensors</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-900">Auto-Detected by Sensor</p>
                    <span className="text-[10px] text-slate-500 font-bold font-mono">{timeStr}</span>
                  </div>
                  <p className="text-xs text-slate-550 leading-snug">
                    Device {incident.device_id} triggered {incident.incident_type} alert. Value: {incident.value?.toFixed(2)}, Threshold: {incident.threshold}.
                  </p>
                </div>
              </div>

              <div className="relative pl-10">
                <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-green-50 border border-green-200 flex items-center justify-center z-10 text-green-600 shadow-sm">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-900">System Recording</p>
                    <span className="text-[10px] text-slate-500 font-bold font-mono">{timeStr}</span>
                  </div>
                  <p className="text-xs text-slate-550 leading-snug">
                    Incident logged to analytics pipeline. WHI score at detection: {Math.round(incident.whi)}%.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-6">
          {washroom && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Device Location</h4>
                <span
                  className="text-blue-600 text-xs font-bold cursor-pointer hover:underline"
                  onClick={() => router.push('/terminal/floor-heatmap')}
                >
                  Heatmap
                </span>
              </div>
              <div className="p-4 space-y-2 bg-slate-50 text-xs">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-slate-400">pin_drop</span>
                  <div>
                    <p className="font-bold text-slate-900">{washroom.terminal} - Level {washroom.level}</p>
                    <p className="text-[10px] text-slate-500 font-semibold">{washroom.type} Unit</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-slate-400">wifi</span>
                  <div>
                    <p className="font-bold text-slate-900">Online</p>
                    <p className="text-[10px] text-slate-500 font-semibold">Last ping: {washroom.timestamp ? new Date(washroom.timestamp).toLocaleTimeString() : 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {washroom && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">WHI Penalty Breakdown</h4>
              <div className="space-y-2 text-xs">
                {[
                  { label: 'NH3 Penalty', value: washroom.penalties?.nh3 ?? 0, max: 40 },
                  { label: 'H2S Penalty', value: washroom.penalties?.h2s ?? 0, max: 25 },
                  { label: 'Humidity Penalty', value: washroom.penalties?.humidity ?? 0, max: 10 },
                  { label: 'Temperature Penalty', value: washroom.penalties?.temperature ?? 0, max: 20 },
                ].map((p) => (
                  <div key={p.label}>
                    <div className="flex justify-between items-center text-xs font-semibold mb-1">
                      <span>{p.label}</span>
                      <span className="font-mono font-bold">{p.value}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className={`h-full ${p.value > 10 ? 'bg-red-500' : p.value > 0 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(100, (p.value / p.max) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IncidentSummaryDetails() {
  return (
    <Suspense fallback={<LoadingSpinner text="Loading incident details..." />}>
      <IncidentDetailContent />
    </Suspense>
  );
}

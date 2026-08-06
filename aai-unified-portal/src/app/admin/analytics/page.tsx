'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, X } from 'lucide-react';
import Header from '@/components/admin/Header';
import { WashroomHealthTrendsChart, IncidentFrequencyBarChart } from '@/components/admin/Charts';
import Heatmap from '@/components/admin/Heatmap';
import { useRealtime } from '@/hooks/useRealtime';

interface DAIncident {
  device_id: string
  terminal: string
  severity: string
  incident_type: string
  description: string
  timestamp: string
  whi: number
}

function computeHealthTrends(trends: any[]) {
  if (!Array.isArray(trends) || trends.length === 0) return []
  return trends.map((t: any, idx: number) => ({
    day: t.day || t.date || `Day ${idx + 1}`,
    score: Math.round(t.avg_whi ?? t.score ?? t.whi ?? 0),
    target: 80,
  }))
}

function computeIncidentSeverity(incidents: any[]) {
  if (!Array.isArray(incidents)) return []
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  incidents.forEach((inc: any) => {
    const sev = (inc.severity || 'LOW').toUpperCase()
    if (sev === 'CRITICAL') counts.CRITICAL++
    else if (sev === 'HIGH') counts.HIGH++
    else if (sev === 'MEDIUM') counts.MEDIUM++
    else counts.LOW++
  })
  return [
    { name: 'Critical', count: counts.CRITICAL, color: '#DC2626' },
    { name: 'High', count: counts.HIGH, color: '#EA580C' },
    { name: 'Medium', count: counts.MEDIUM, color: '#CA8A04' },
    { name: 'Low', count: counts.LOW, color: '#16A34A' },
  ]
}

export default function AnalyticsPage() {
  const [showDetailedLog, setShowDetailedLog] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { summary: rtSummary, incidents: rtIncidents, trends: rtTrends } = useRealtime();

  useEffect(() => {
    if (rtSummary) {
      setSummary((prev: any) => ({ ...prev, ...rtSummary }));
    }
  }, [rtSummary]);

  useEffect(() => {
    if (rtIncidents && rtIncidents.length > 0) {
      setIncidents((prev: any[]) => {
        const merged = [...rtIncidents, ...prev];
        const deduped = merged.filter((item: any, index: number, self: any[]) =>
          index === self.findIndex((t: any) =>
            t.device_id === item.device_id && t.timestamp === item.timestamp
          )
        );
        return deduped.slice(0, 200);
      });
    }
  }, [rtIncidents]);

  useEffect(() => {
    if (rtTrends?.daily && rtTrends.daily.length > 0) {
      setTrends((prev: any[]) => {
        if (prev.length === 0) return rtTrends.daily;
        return prev;
      });
    }
  }, [rtTrends]);

  const loadData = useCallback(async () => {
    try {
      const [sumRes, trendsRes, incRes] = await Promise.all([
        fetch('/api/da/summary', { cache: 'no-store' }),
        fetch('/api/da/trends', { cache: 'no-store' }),
        fetch('/api/da/incidents', { cache: 'no-store' }),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (trendsRes.ok) {
        const data = await trendsRes.json();
        setTrends(Array.isArray(data) ? data : []);
      }
      if (incRes.ok) {
        const data = await incRes.json();
        setIncidents(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching analytics data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(loadData, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadData]);

  const avgWhi = summary?.airport_whi?.toFixed(1) ?? '—';
  const totalWashrooms = summary?.total_washrooms ?? 0;
  const criticalCount = summary?.critical_count ?? 0;
  const healthTrendsData = computeHealthTrends(trends);
  const incidentSeverityData = computeIncidentSeverity(incidents);

  return (
    <>
      <Header title="Analytics Report" placeholder="Search analytics insights..." />

      <div className="p-6 flex flex-col gap-6 max-w-7xl mx-auto w-full flex-grow font-sans text-sm">
        <section className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
            <div className="flex flex-col px-3 border-r border-slate-200">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 font-bold">
                Date Range
              </label>
              <select className="border-none bg-transparent p-0 text-sm text-slate-800 focus:ring-0 cursor-pointer focus:outline-none font-medium">
                <option>Last 30 Days</option>
                <option>Last Quarter</option>
                <option>Year to Date</option>
              </select>
            </div>

            <div className="flex flex-col px-3">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 font-bold">
                Terminal
              </label>
              <select className="border-none bg-transparent p-0 text-sm text-slate-800 focus:ring-0 cursor-pointer focus:outline-none font-medium">
                <option>All Terminals</option>
                <option>Terminal 1</option>
                <option>Terminal 2</option>
                <option>Terminal 3</option>
              </select>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow relative">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-xs text-slate-500 font-medium">Overall Health Index</p>
                <h3 className="text-2xl text-blue-600 mt-1 font-bold">{avgWhi}%</h3>
              </div>
              <span className="material-symbols-outlined text-blue-600 bg-blue-50 p-2 rounded-lg border border-blue-100">
                health_and_safety
              </span>
            </div>
            <div className="flex items-center gap-1 text-emerald-600">
              <span className="material-symbols-outlined text-sm">trending_up</span>
              <span className="text-xs font-bold">Live</span>
              <span className="text-xs text-slate-500 ml-1 font-normal">
                from DA Engine
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow relative">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Washrooms</p>
                <h3 className="text-2xl text-slate-900 mt-1 font-bold">{totalWashrooms}</h3>
              </div>
              <span className="material-symbols-outlined text-orange-600 bg-orange-50 p-2 rounded-lg border border-orange-100">
                warning
              </span>
            </div>
            <div className="flex items-center gap-1 text-orange-600">
              <span className="text-xs font-bold">{totalWashrooms}</span>
              <span className="text-xs text-slate-500 ml-1 font-normal">monitored nodes</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow relative">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-xs text-slate-500 font-medium">Critical Incidents</p>
                <h3 className="text-2xl text-slate-900 mt-1 font-bold">{criticalCount}</h3>
              </div>
              <span className="material-symbols-outlined text-blue-600 bg-blue-50 p-2 rounded-lg border border-blue-100">
                timer
              </span>
            </div>
            <div className="flex items-center gap-1 text-emerald-600">
              <span className="text-xs font-bold">Real-time</span>
              <span className="text-xs text-slate-500 ml-1 font-normal">detection</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow relative">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-xs text-slate-550 font-medium">Online Sensors</p>
                <h3 className="text-2xl text-slate-900 mt-1 font-bold">{summary?.online_devices ?? 0}</h3>
              </div>
              <span className="material-symbols-outlined text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200">
                engineering
              </span>
            </div>
            <div className="flex items-center gap-1 text-slate-600">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span className="text-xs font-bold">100%</span>
              <span className="text-xs text-slate-550 ml-1 font-normal">
                online now
              </span>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl lg:col-span-8 flex flex-col shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-lg text-slate-900 font-bold">Washroom Health Trends</h2>
                <p className="text-xs text-slate-500">
                  Daily Washroom Hygiene Index (WHI) over the last 14 days vs target score
                </p>
              </div>
              <div className="flex gap-2">
                <span className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <span className="w-3 h-3 rounded-full bg-emerald-600 inline-block"></span> Current
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <span className="w-3 h-3 rounded-full bg-slate-300 inline-block border border-dashed border-slate-400"></span> Target
                </span>
              </div>
            </div>
            <WashroomHealthTrendsChart data={healthTrendsData} targetScore={80} />
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-2xl lg:col-span-4 flex flex-col shadow-sm hover:shadow-md transition-shadow">
            <div className="mb-6">
              <h2 className="text-lg text-slate-900 font-bold">Incident Frequency</h2>
              <p className="text-xs text-slate-500">Incidents grouped by severity level</p>
            </div>
            <div className="flex-grow flex flex-col justify-between">
              <IncidentFrequencyBarChart data={incidentSeverityData} />
            </div>
            <button
              onClick={() => setShowDetailedLog(true)}
              className="mt-6 w-full flex items-center justify-center gap-2 text-blue-600 hover:text-blue-700
                text-xs font-semibold border border-blue-200 bg-blue-50
                hover:bg-blue-100 py-2 rounded-xl transition-colors cursor-pointer"
            >
              <Eye size={15} />
              View Detailed Log
            </button>
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-2xl lg:col-span-12 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
              <div>
                <h2 className="text-lg text-slate-900 font-bold">
                  Peak Usage Density Heatmap
                </h2>
                <p className="text-xs text-slate-500">
                  Foot traffic intensity across all monitored facilities by day and hour
                </p>
              </div>
            </div>
            <Heatmap />
          </div>
        </section>
      </div>

      {showDetailedLog && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setShowDetailedLog(false)}
          />
          <div className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Incident Frequency — Detailed Log
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  All incidents grouped by terminal and severity
                </p>
              </div>
              <button
                onClick={() => setShowDetailedLog(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors border-none bg-transparent cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              <DetailedIncidentLog />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DetailedIncidentLog() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/da/incidents', { cache: 'no-store' })
      .then(res => res.json())
      .then(json => {
        setData(Array.isArray(json) ? json : []);
      })
      .catch(err => console.error('Error fetching incidents:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="animate-spin text-slate-400 mr-2">⏳</span> Loading incidents log...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        No incidents logged yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
      <table className="w-full text-left text-sm text-slate-700">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-b border-slate-200">
          <tr>
            <th className="px-6 py-4">Device ID</th>
            <th className="px-6 py-4">Incident Type</th>
            <th className="px-6 py-4">Terminal</th>
            <th className="px-6 py-4">Severity</th>
            <th className="px-6 py-4">Value</th>
            <th className="px-6 py-4">Timestamp</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((item: any, idx: number) => (
            <tr key={idx} className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-mono font-bold text-slate-900">
                {item.device_id}
              </td>
              <td className="px-6 py-4 font-semibold text-slate-900">
                {item.description || item.incident_type}
              </td>
              <td className="px-6 py-4">
                {item.terminal}
              </td>
              <td className="px-6 py-4">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${
                  item.severity === 'CRITICAL' ? 'bg-red-50 text-red-600 border-red-200' :
                  'bg-orange-50 text-orange-600 border-orange-200'
                }`}>
                  {item.severity}
                </span>
              </td>
              <td className="px-6 py-4 font-mono text-xs text-slate-600">
                {item.value?.toFixed(2)} ({item.threshold})
              </td>
              <td className="px-6 py-4 font-mono text-xs text-slate-500">
                {item.timestamp ? new Date(item.timestamp).toLocaleString('en-IN') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

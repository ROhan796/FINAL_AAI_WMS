'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart,
  Bar,
  ResponsiveContainer
} from 'recharts';
import { useRealtime } from '@/hooks/useRealtime';

interface WashroomRanking {
  rank: number;
  device_id: string;
  whi: number;
  status: string;
  terminal: string;
  level: string;
  type: string;
}

interface TerminalSummary {
  avg_whi: number;
  critical_count: number;
}

interface LiveWhiData {
  timestamp: string;
  rankings: WashroomRanking[];
  by_terminal: Record<string, TerminalSummary>;
}

type TimeRange = 'Live' | '1 Hour' | '24 Hours';

function buildSparkline(current: number, history: number[] = []): { val: number }[] {
  if (history.length >= 6) {
    return history.slice(-6).map(v => ({ val: v }));
  }
  const points: { val: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const jitter = Math.round((Math.random() - 0.5) * 4);
    points.push({ val: Math.max(0, Math.min(100, current + jitter * i)) });
  }
  points.push({ val: current });
  return points;
}

export default function LiveWhiFeed() {
  const router = useRouter();
  const [pulseColor, setPulseColor] = useState('#EF4444');
  const [data, setData] = useState<LiveWhiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sparklines, setSparklines] = useState<Record<string, { val: number }[]>>({});
  const [timeRange, setTimeRange] = useState<TimeRange>('Live');
  const [performanceHistory, setPerformanceHistory] = useState<Record<string, number[]>>({});
  const [wsData, setWsData] = useState<LiveWhiData | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { liveWHI, connected } = useRealtime();

  const getPollInterval = useCallback(() => {
    switch (timeRange) {
      case 'Live': return 10000;
      case '1 Hour': return 30000;
      case '24 Hours': return 60000;
      default: return 10000;
    }
  }, [timeRange]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/da/live-whi', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setData(d);

        setPerformanceHistory(prev => {
          const next: Record<string, number[]> = { ...prev };
          for (const r of d.rankings || []) {
            next[r.device_id] = prev[r.device_id]
              ? [...prev[r.device_id].slice(-19), r.whi]
              : [r.whi];
          }
          return next;
        });

        setSparklines(prev => {
          const next: Record<string, { val: number }[]> = { ...prev };
          for (const r of d.rankings || []) {
            const history = performanceHistory[r.device_id] || [];
            next[r.device_id] = prev[r.device_id]
              ? [...prev[r.device_id].slice(1), { val: r.whi }]
              : buildSparkline(r.whi, [...history, r.whi]);
          }
          return next;
        });
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [performanceHistory]);

  useEffect(() => {
    fetchData();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchData, getPollInterval());
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData, getPollInterval]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulseColor(prev => prev === '#EF4444' ? '#F87171' : '#EF4444');
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (liveWHI && liveWHI.length > 0) {
      setWsData(prev => ({
        timestamp: new Date().toISOString(),
        rankings: liveWHI.map((w: any, idx: number) => ({
          rank: idx + 1,
          device_id: w.device_id,
          whi: w.whi,
          status: w.status,
          terminal: w.terminal,
          level: w.level || '',
          type: w.type || '',
        })),
        by_terminal: prev?.by_terminal || {},
      }));
    }
  }, [liveWHI]);

  const rankings = (wsData || data)?.rankings || [];
  const criticalUnits = rankings.filter(r => r.whi < 60);
  const sortedRankings = [...rankings].sort((a, b) => b.whi - a.whi);

  const topZones = rankings.slice(0, 3);
  while (topZones.length < 3) {
    topZones.push({ rank: topZones.length + 1, device_id: `zone-${topZones.length}`, whi: 0, status: 'UNKNOWN', terminal: '', level: '', type: '' });
  }

  const zoneColors = ['#10B981', '#F59E0B', '#EF4444'];

  const computeTrend = (deviceId: string): { arrow: string; pct: string; color: string } => {
    const history = performanceHistory[deviceId] || [];
    if (history.length < 2) return { arrow: '→', pct: '0%', color: 'text-slate-500' };
    const current = history[history.length - 1];
    const prev = history[history.length - 2];
    const diff = current - prev;
    const pct = Math.abs(diff).toFixed(0);
    if (diff > 0) return { arrow: '↑', pct: `+${pct}%`, color: 'text-green-600' };
    if (diff < 0) return { arrow: '↓', pct: `-${pct}%`, color: 'text-red-650' };
    return { arrow: '→', pct: '0%', color: 'text-amber-600' };
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in font-sans text-sm text-slate-700">
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-slate-500 font-bold">Loading live telemetry from DA Engine...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900">
                  <span className="material-symbols-outlined text-blue-600">analytics</span>
                  Real-time Performance Trends
                </h3>
                <div className="flex gap-2">
                  {(['Live', '1 Hour', '24 Hours'] as TimeRange[]).map((range) => (
                    <button
                      key={range}
                      onClick={() => setTimeRange(range)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer transition-all ${
                        timeRange === range
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'hover:bg-slate-50 text-slate-650 bg-transparent'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {topZones.map((zone, idx) => {
                  const color = zone.whi >= 75 ? '#10B981' : zone.whi >= 60 ? '#F59E0B' : '#EF4444';
                  const trend = computeTrend(zone.device_id);
                  const zoneData = sparklines[zone.device_id] || buildSparkline(zone.whi);

                  return (
                    <div key={zone.device_id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between h-40">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{zone.device_id}</span>
                        <span className={`${trend.color} font-bold text-xs`}>{trend.arrow} {trend.pct}</span>
                      </div>
                      <div className="text-2xl font-bold leading-none mb-2" style={{ color }}>{zone.whi}</div>
                      <div className="h-12 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={zoneData}>
                            <Bar dataKey="val" fill={color} radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="col-span-12 lg:col-span-4 bg-red-50 p-6 rounded-2xl border border-red-200 flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-red-655 animate-pulse" style={{ color: pulseColor }}>warning</span>
                  <h3 className="text-sm font-bold text-slate-900">Critical Attention</h3>
                </div>
                <p className="text-[10px] font-bold text-slate-500 mb-4 uppercase tracking-wider">Units below 60 WHI threshold</p>
                <div className="space-y-4">
                  {criticalUnits.length === 0 ? (
                    <div className="bg-white p-4 rounded-xl border border-green-200 border-l-4 border-l-green-500 text-center">
                      <p className="font-bold text-xs text-green-700">All units above threshold</p>
                    </div>
                  ) : (
                    criticalUnits.slice(0, 3).map(w => (
                      <div
                        key={w.device_id}
                        onClick={() => router.push('/terminal/washrooms')}
                        className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-red-500 flex items-center justify-between shadow-sm cursor-pointer hover:bg-slate-50 transition-colors"
                      >
                        <div>
                          <p className="font-bold text-xs text-slate-900">{w.device_id}</p>
                          <p className="text-[10px] text-slate-500 font-bold">{w.terminal} - {w.level}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-red-655">{w.whi}</p>
                          <p className="text-[10px] text-red-650 font-bold uppercase tracking-wider">
                            {w.whi < 40 ? 'URGENT' : 'MONITOR'}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {criticalUnits.length > 0 && (
                <button
                  onClick={() => router.push('/terminal/incidents')}
                  className="mt-6 w-full py-2.5 bg-red-650 text-white rounded-xl font-bold flex items-center justify-center gap-1 hover:bg-red-705 transition-all cursor-pointer shadow-sm border-none text-xs"
                >
                  <span className="material-symbols-outlined text-sm">emergency_share</span>
                  Dispatch Rapid Response
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-7 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h3 className="text-sm font-bold text-slate-900">Performance Leaderboard</h3>
                <div className="flex items-center gap-1 text-slate-600 bg-slate-100 border border-slate-200 px-4 py-1.5 rounded-full">
                  <span className="material-symbols-outlined text-sm">filter_list</span>
                  <span className="text-[10px] font-bold">All Terminals</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="border-b border-slate-200">
                    <tr className="text-xs text-slate-555 font-bold uppercase tracking-wider">
                      <th className="py-4 px-2">Rank</th>
                      <th className="py-4 px-2">Device ID</th>
                      <th className="py-4 px-2">WHI Score</th>
                      <th className="py-4 px-2">Terminal</th>
                      <th className="py-4 px-2">Trend</th>
                      <th className="text-right py-4 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {sortedRankings.slice(0, 10).map((w, idx) => {
                      const trend = computeTrend(w.device_id);
                      return (
                        <tr
                          key={w.device_id}
                          className="hover:bg-slate-50 transition-colors group cursor-pointer"
                          onClick={() => router.push('/terminal/washrooms')}
                        >
                          <td className="py-4 px-2">
                            <span className={`w-8 h-8 flex items-center justify-center font-bold rounded-full text-xs shadow-sm ${
                              idx === 0 ? 'bg-blue-600 text-white' : idx === 1 ? 'bg-amber-500 text-white' : idx === 2 ? 'bg-slate-300 text-slate-700' : 'text-slate-500'
                            }`}>
                              #{w.rank}
                            </span>
                          </td>
                          <td className="py-4 px-2 font-bold text-slate-900">{w.device_id}</td>
                          <td className="py-4 px-2">
                            <span className={`font-bold ${w.whi >= 75 ? 'text-green-600' : w.whi >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{w.whi}</span>
                          </td>
                          <td className="py-4 px-2 text-slate-500 font-bold">{w.terminal}</td>
                          <td className="py-4 px-2">
                            <span className={`${trend.color} font-bold`}>{trend.arrow} {trend.pct}</span>
                          </td>
                          <td className="py-4 px-2 text-right">
                            <span className={`px-3 py-1 rounded-full border text-[10px] font-bold ${
                              w.whi >= 75 ? 'bg-green-50 text-green-700 border-green-200' :
                              w.whi >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-red-50 text-red-700 border-red-200'
                            }`}>
                              {w.whi >= 75 ? 'GOOD' : w.whi >= 60 ? 'WARNING' : 'CRITICAL'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-5 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col relative overflow-hidden justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">Terminal Hygiene Map</h3>
                <p className="text-[10px] text-slate-500 mb-6 font-bold">Real-time sensor density grid</p>
                {data?.by_terminal && (
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    {Object.entries(data.by_terminal).map(([terminal, summary]) => (
                      <div key={terminal} className="text-center p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">{terminal}</p>
                        <p className="text-lg font-bold text-slate-900">{summary.avg_whi}</p>
                        <p className="text-[10px] text-red-600 font-bold">{summary.critical_count} critical</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-5 grid-rows-4 gap-2 h-64 cursor-pointer" onClick={() => router.push('/terminal/floor-heatmap')}>
                {Array.from({ length: 20 }, (_, i) => {
                  const w = rankings[i % rankings.length];
                  const whi = w?.whi || 80;
                  const bgClass = whi >= 75 ? 'bg-green-500' : whi >= 60 ? 'bg-amber-500' : 'bg-red-500';
                  const opacity = 0.3 + (whi / 100) * 0.6;
                  const pulse = whi < 60 ? ' animate-pulse border border-red-300' : '';
                  return (
                    <div
                      key={i}
                      className={`${bgClass} rounded-sm hover:brightness-105 transition-all${pulse}`}
                      style={{ opacity }}
                      title={w ? `${w.device_id}: WHI ${w.whi}` : `Zone ${i + 1}`}
                    />
                  );
                })}
              </div>
              <div className="mt-6 flex items-center justify-between text-[10px] text-slate-500 font-bold">
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-red-500 rounded-sm"></span>
                  <span>Action Required</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-amber-500 rounded-sm"></span>
                  <span>Average</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-green-500 rounded-sm"></span>
                  <span>Optimal</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

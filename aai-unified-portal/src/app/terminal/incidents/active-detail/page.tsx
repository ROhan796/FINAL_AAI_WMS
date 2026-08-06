'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRealtime } from '@/hooks/useRealtime';

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

interface ActiveIncident {
  id: string;
  priority: 'Critical' | 'High' | 'Medium';
  category: string;
  categoryIcon: string;
  location: string;
  timeElapsed: string;
  assignedStaff: string;
  status: string;
  device_id: string;
  terminal: string;
  severity: string;
  value: number;
  threshold: number;
}

function getIncidentCategory(type: string): { label: string; icon: string } {
  const map: Record<string, { label: string; icon: string }> = {
    CRITICAL_NH3: { label: 'Air Quality', icon: 'air' },
    HIGH_NH3: { label: 'Air Quality', icon: 'air' },
    CRITICAL_H2S: { label: 'Air Quality', icon: 'air' },
    HIGH_H2S: { label: 'Air Quality', icon: 'air' },
    CRITICAL_WHIP: { label: 'Hygiene Index', icon: 'sanitizer' },
    LOW_WHIP: { label: 'Hygiene Index', icon: 'sanitizer' },
    HIGH_OCCUPANCY: { label: 'Occupancy', icon: 'group' },
    HIGH_HUMIDITY: { label: 'Climate', icon: 'thermostat' },
    HIGH_TEMPERATURE: { label: 'Climate', icon: 'thermostat' },
  };
  return map[type] || { label: 'General', icon: 'warning' };
}

function getPriority(severity: string): 'Critical' | 'High' | 'Medium' {
  if (severity === 'CRITICAL') return 'Critical';
  if (severity === 'WARNING') return 'High';
  return 'Medium';
}

function getTimeElapsed(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function ActiveIncidentsDetail() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [incidents, setIncidents] = useState<ActiveIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ critical: 0, high: 0, medium: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { incidents: realtimeIncidents } = useRealtime();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/da/incidents', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const arr: DAIncident[] = Array.isArray(data) ? data : [];

        const mapped: ActiveIncident[] = arr.map((inc, idx) => {
          const cat = getIncidentCategory(inc.incident_type);
          const priority = getPriority(inc.severity);
          return {
            id: `${inc.device_id}-${inc.incident_type}-${idx}`,
            priority,
            category: cat.label,
            categoryIcon: cat.icon,
            location: `${inc.terminal}-${inc.level} ${inc.type}`,
            timeElapsed: getTimeElapsed(inc.timestamp),
            assignedStaff: 'Auto-Detected',
            status: inc.severity === 'CRITICAL' ? 'Dispatched' : 'Monitoring',
            device_id: inc.device_id,
            terminal: inc.terminal,
            severity: inc.severity,
            value: inc.value,
            threshold: inc.threshold,
          };
        });

        setIncidents(mapped);
        setCounts({
          critical: mapped.filter(i => i.priority === 'Critical').length,
          high: mapped.filter(i => i.priority === 'High').length,
          medium: mapped.filter(i => i.priority === 'Medium').length,
        });
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 15000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  useEffect(() => {
    if (realtimeIncidents.length > 0) {
      const mapped: ActiveIncident[] = realtimeIncidents.map((inc: any, idx: number) => {
        const cat = getIncidentCategory(inc.incident_type || '');
        const priority = getPriority(inc.severity || 'MEDIUM');
        return {
          id: `${inc.device_id || inc.washroom_id || 'unknown'}-${inc.incident_type || 'incident'}-${idx}`,
          priority,
          category: cat.label,
          categoryIcon: cat.icon,
          location: `${inc.terminal || ''}-${(inc as any).level || ''} ${(inc as any).type || ''}`,
          timeElapsed: getTimeElapsed(inc.timestamp || ''),
          assignedStaff: 'Auto-Detected',
          status: (inc.severity === 'CRITICAL') ? 'Dispatched' : 'Monitoring',
          device_id: inc.device_id || inc.washroom_id || '',
          terminal: inc.terminal || '',
          severity: inc.severity || 'MEDIUM',
          value: (inc as any).value || 0,
          threshold: (inc as any).threshold || 0,
        };
      });
      setIncidents(prev => {
        if (prev.length === 0) return mapped;
        const existing = new Set(prev.map(p => `${p.terminal}-${p.device_id}`));
        const newOnly = mapped.filter(m => !existing.has(`${m.terminal}-${m.device_id}`));
        const merged = [...newOnly, ...prev].slice(0, 50);
        setCounts({
          critical: merged.filter(i => i.priority === 'Critical').length,
          high: merged.filter(i => i.priority === 'High').length,
          medium: merged.filter(i => i.priority === 'Medium').length,
        });
        return merged;
      });
    }
  }, [realtimeIncidents]);

  const filtered = incidents.filter((inc) => {
    const term = searchTerm.toLowerCase();
    return (
      inc.id.toLowerCase().includes(term) ||
      inc.category.toLowerCase().includes(term) ||
      inc.location.toLowerCase().includes(term) ||
      inc.device_id.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in font-sans">
      <div className="flex justify-between items-end mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-xl text-on-surface font-bold">Active Incidents</h2>
          <p className="text-xs text-on-surface-variant">Real-time oversight of terminal infrastructure anomalies.</p>
        </div>
        <button
          onClick={() => router.push('/terminal/incidents')}
          className="bg-primary text-on-primary px-6 py-2 rounded shadow-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-1 font-bold cursor-pointer border-none text-xs"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          New Incident
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-surface-container-lowest p-4 border-l-4 border-error shadow-sm rounded bg-white">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-error uppercase tracking-widest">Critical</span>
            <span className="material-symbols-outlined text-error">emergency</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-on-surface">{String(counts.critical).padStart(2, '0')}</span>
            <span className="text-xs text-on-surface-variant ml-1">Active Alerts</span>
          </div>
          <div className="mt-1 w-full bg-surface-container-high h-1 rounded-full overflow-hidden">
            <div className="bg-error h-full" style={{ width: `${counts.critical > 0 ? Math.min(100, (counts.critical / Math.max(incidents.length, 1)) * 100) : 0}%` }}></div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 border-l-4 border-[#ff9100] shadow-sm rounded bg-white">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-[#ff9100] uppercase tracking-widest">High Priority</span>
            <span className="material-symbols-outlined text-[#ff9100]">priority_high</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-on-surface">{String(counts.high).padStart(2, '0')}</span>
            <span className="text-xs text-on-surface-variant ml-1">Ongoing</span>
          </div>
          <div className="mt-1 w-full bg-surface-container-high h-1 rounded-full overflow-hidden">
            <div className="bg-[#ff9100] h-full" style={{ width: `${counts.high > 0 ? Math.min(100, (counts.high / Math.max(incidents.length, 1)) * 100) : 0}%` }}></div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 border-l-4 border-tertiary shadow-sm rounded bg-white">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-tertiary uppercase tracking-widest">Medium</span>
            <span className="material-symbols-outlined text-tertiary">info</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-on-surface">{String(counts.medium).padStart(2, '0')}</span>
            <span className="text-xs text-on-surface-variant ml-1">Pending</span>
          </div>
          <div className="mt-1 w-full bg-surface-container-high h-1 rounded-full overflow-hidden">
            <div className="bg-tertiary h-full" style={{ width: `${counts.medium > 0 ? Math.min(100, (counts.medium / Math.max(incidents.length, 1)) * 100) : 0}%` }}></div>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded shadow-sm overflow-hidden border border-outline-variant bg-white">
        <div className="p-6 border-b border-outline-variant flex flex-col sm:flex-row justify-between items-center bg-surface-container-low gap-4">
          <h3 className="text-sm font-bold text-on-surface">Live Incident Feed</h3>
          <div className="flex gap-2 flex-wrap w-full sm:w-auto">
            <div className="relative flex-grow sm:flex-grow-0">
              <input
                type="text"
                placeholder="Search incidents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-1.5 bg-white border border-outline-variant rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 w-full sm:w-64"
              />
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">search</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="px-6 py-4 text-xs font-bold text-on-surface-variant uppercase">Incident ID</th>
                <th className="px-6 py-4 text-xs font-bold text-on-surface-variant uppercase">Priority</th>
                <th className="px-6 py-4 text-xs font-bold text-on-surface-variant uppercase">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-on-surface-variant uppercase">Location</th>
                <th className="px-6 py-4 text-xs font-bold text-on-surface-variant uppercase">Value</th>
                <th className="px-6 py-4 text-xs font-bold text-on-surface-variant uppercase">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-on-surface-variant uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50 text-xs">
              {filtered.map((inc) => {
                const priorityPill =
                  inc.priority === 'Critical' ? 'bg-error/10 text-error border-error/20' :
                  inc.priority === 'High' ? 'bg-[#ff9100]/10 text-[#ff9100] border-[#ff9100]/20' :
                  'bg-tertiary/10 text-tertiary border-tertiary/20';

                const statusPill =
                  inc.status === 'Dispatched' ? 'bg-primary/10 text-primary border-primary/20' :
                  'bg-secondary-container text-on-secondary-container';

                return (
                  <tr
                    key={inc.id}
                    onClick={() => router.push('/terminal/incidents')}
                    className="hover:bg-surface-container-high/50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 font-bold text-on-surface">{inc.id}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-tighter ${priorityPill}`}>
                        {inc.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-on-surface-variant text-sm">
                          {inc.categoryIcon}
                        </span>
                        <span className="font-medium text-on-surface">{inc.category}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-on-surface">{inc.location}</td>
                    <td className={`px-6 py-4 font-mono ${inc.priority === 'Critical' ? 'text-error font-bold' : 'text-on-surface'}`}>
                      {inc.value?.toFixed(1)} / {inc.threshold}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-tighter ${statusPill}`}>
                        {inc.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors text-sm">
                        chevron_right
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex justify-between items-center">
          <p className="text-xs text-on-surface-variant font-medium">Showing {filtered.length} of {incidents.length} active incidents</p>
        </div>
      </div>
    </div>
  );
}

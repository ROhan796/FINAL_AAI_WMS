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

interface AuditRow {
  timestamp: string;
  user: string;
  isSystem: boolean;
  type: string;
  typeColor: string;
  unit: string;
  details: string;
  status: string;
  statusColor: string;
}

function mapIncidentToAudit(inc: DAIncident, idx: number): AuditRow {
  const isSystem = true;
  const typeMap: Record<string, { label: string; color: string }> = {
    CRITICAL_NH3: { label: 'Sensor Alert', color: 'bg-red-50 text-red-700 border border-red-200' },
    HIGH_NH3: { label: 'Sensor Warning', color: 'bg-amber-50 text-amber-700 border border-amber-200' },
    CRITICAL_H2S: { label: 'Sensor Alert', color: 'bg-red-50 text-red-700 border border-red-200' },
    HIGH_H2S: { label: 'Sensor Warning', color: 'bg-amber-50 text-amber-700 border border-amber-200' },
    CRITICAL_WHIP: { label: 'WHI Alert', color: 'bg-red-50 text-red-700 border border-red-200' },
    LOW_WHIP: { label: 'WHI Warning', color: 'bg-amber-50 text-amber-700 border border-amber-200' },
    HIGH_OCCUPANCY: { label: 'Occupancy', color: 'bg-blue-50 text-blue-700 border border-blue-200' },
    HIGH_HUMIDITY: { label: 'Climate', color: 'bg-purple-50 text-purple-700 border border-purple-200' },
    HIGH_TEMPERATURE: { label: 'Climate', color: 'bg-purple-50 text-purple-700 border border-purple-200' },
  };

  const typeInfo = typeMap[inc.incident_type] || { label: 'System Event', color: 'bg-slate-100 text-slate-600 border border-slate-200' };

  const isCritical = inc.severity === 'CRITICAL';
  const statusLabel = isCritical ? 'ALERT' : 'WARNING';
  const statusColor = isCritical
    ? 'bg-red-50 text-red-700 border border-red-200 animate-pulse'
    : 'bg-amber-50 text-amber-700 border border-amber-200';

  const ts = new Date(inc.timestamp);

  return {
    timestamp: ts.toLocaleString(),
    user: 'SYS_SENSOR',
    isSystem,
    type: typeInfo.label,
    typeColor: typeInfo.color,
    unit: inc.device_id,
    details: `${inc.description}: ${inc.value?.toFixed(2)} (threshold: ${inc.threshold})`,
    status: statusLabel,
    statusColor,
  };
}

export default function AuditLog() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeType, setActiveType] = useState('All Activities');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState({ total: 0, security: 0, activeControllers: 36 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { incidents: realtimeIncidents } = useRealtime();

  const fetchData = useCallback(async () => {
    try {
      // Fetch from multiple sources for comprehensive audit logs
      const [daRes, auditRes] = await Promise.allSettled([
        fetch('/api/da/incidents', { cache: 'no-store' }),
        fetch('/api/audit-logs?limit=100', { cache: 'no-store' }),
      ])

      const allRows: AuditRow[] = []

      // Process DA Engine incidents
      if (daRes.status === 'fulfilled' && daRes.value.ok) {
        const data = await daRes.value.json()
        const arr: DAIncident[] = Array.isArray(data) ? data : []
        const auditRows = arr.map((inc, idx) => mapIncidentToAudit(inc, idx))
        allRows.push(...auditRows)
      }

      // Process system/audit logs from database
      if (auditRes.status === 'fulfilled' && auditRes.value.ok) {
        const data = await auditRes.value.json()
        const dbRows: AuditRow[] = (Array.isArray(data) ? data : []).map((log: any, idx: number) => {
          const typeMap: Record<string, { label: string; color: string }> = {
            SENSOR_ALERT: { label: 'Sensor Alert', color: 'bg-red-50 text-red-700 border border-red-200' },
            SENSOR_WARNING: { label: 'Sensor Warning', color: 'bg-amber-50 text-amber-700 border border-amber-200' },
            WHI_ALERT: { label: 'WHI Alert', color: 'bg-red-50 text-red-700 border border-red-200' },
            USER_LOGIN: { label: 'User Login', color: 'bg-blue-50 text-blue-700 border border-blue-200' },
            USER_ACTION: { label: 'User Action', color: 'bg-purple-50 text-purple-700 border border-purple-200' },
            SYSTEM_EVENT: { label: 'System Event', color: 'bg-slate-100 text-slate-600 border border-slate-200' },
            SETTINGS_CHANGE: { label: 'Settings Change', color: 'bg-violet-50 text-violet-700 border border-violet-200' },
            INCIDENT_RESOLVE: { label: 'Incident Resolve', color: 'bg-green-50 text-green-700 border border-green-200' },
            INCIDENT_ACKNOWLEDGE: { label: 'Incident Acknowledge', color: 'bg-amber-50 text-amber-700 border border-amber-200' },
          }
          const typeInfo = typeMap[log.eventType || log.action] || { label: log.eventType || 'System Event', color: 'bg-slate-100 text-slate-600 border border-slate-200' }
          const severity = log.severity || 'INFO'
          const statusLabel = severity === 'CRITICAL' ? 'ALERT' : severity === 'HIGH' ? 'WARNING' : 'INFO'
          const statusColor = severity === 'CRITICAL'
            ? 'bg-red-50 text-red-700 border border-red-200 animate-pulse'
            : severity === 'HIGH'
            ? 'bg-amber-50 text-amber-700 border border-amber-200'
            : 'bg-green-50 text-green-700 border border-green-200'

          return {
            timestamp: new Date(log.timestamp).toLocaleString(),
            user: log.userId || log.user_id || 'SYSTEM',
            isSystem: log.userId?.startsWith('SYS_') || false,
            type: typeInfo.label,
            typeColor: typeInfo.color,
            unit: log.terminalId || '-',
            details: log.details || '-',
            status: statusLabel,
            statusColor,
          }
        })
        allRows.push(...dbRows)
      }

      // Sort by timestamp descending
      allRows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      setRows(allRows)
      setKpi({
        total: allRows.length,
        security: allRows.filter(r => r.type === 'Sensor Alert').length,
        activeControllers: 36,
      })
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  useEffect(() => {
    if (realtimeIncidents.length > 0) {
      const mapped = realtimeIncidents.map((inc: any, idx: number) => mapIncidentToAudit({
        device_id: inc.device_id || inc.washroom_id || 'unknown',
        terminal: inc.terminal || '',
        level: '',
        type: '',
        incident_type: inc.incident_type || inc.severity || 'incident',
        severity: inc.severity || 'HIGH',
        description: inc.description || '',
        value: (inc as any).value || 0,
        threshold: (inc as any).threshold || 0,
        timestamp: inc.timestamp || new Date().toISOString(),
        whi: inc.whi || 0,
      }, idx));
      setRows(prev => {
        if (prev.length === 0) return mapped;
        const existing = new Set(prev.map(r => `${r.unit}-${r.timestamp}`));
        const newOnly = mapped.filter(m => !existing.has(`${m.unit}-${m.timestamp}`));
        return [...newOnly, ...prev].slice(0, 50);
      });
    }
  }, [realtimeIncidents]);

  const filteredRows = rows.filter((row) => {
    const matchesSearch =
      row.unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.user.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = activeType === 'All Activities' || row.type === activeType;
    return matchesSearch && matchesType;
  });

  const types = ['All Activities', ...Array.from(new Set(rows.map(r => r.type)))];

  return (
    <div className="p-6 space-y-6 animate-fade-in text-slate-705 font-sans text-sm">
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Audit Log</h2>
          <p className="text-xs text-slate-500">Terminal System - Real-time sensor event history</p>
        </div>
        <button
          onClick={fetchData}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-xs font-bold flex items-center gap-1 hover:shadow-md transition-all active:scale-95 cursor-pointer border-none shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-200 p-6 flex flex-col gap-1 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Events</span>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold text-slate-900">{kpi.total}</span>
            <span className="text-blue-600 text-[10px] font-bold flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[16px]">sensors</span> Live
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 flex flex-col gap-1 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Critical Alerts</span>
          <div className="flex items-end justify-between">
            <span className="text-2xl text-red-655 font-bold">{kpi.security}</span>
            <span className="text-red-650 text-[10px] font-bold flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[16px]">warning</span> Action Required
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 flex flex-col gap-1 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">System Sync Rate</span>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold text-slate-900">99.98%</span>
            <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden mb-2 border border-slate-200">
              <div className="h-full bg-blue-600 w-[99%]"></div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 flex flex-col gap-1 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Devices</span>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold text-slate-900">{kpi.activeControllers}</span>
            <span className="text-xs text-slate-555 font-bold">All online</span>
          </div>
        </div>
      </div>

      <section className="bg-white border border-slate-205 p-4 rounded-2xl flex items-center justify-between flex-wrap gap-4 shadow-sm">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500">FILTER:</span>
            <select
              value={activeType}
              onChange={(e) => setActiveType(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-400 cursor-pointer"
            >
              {types.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative w-full sm:w-auto">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">filter_list</span>
          <input
            type="text"
            placeholder="Filter by Device ID or Keyword..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-1.5 bg-white border border-slate-300 rounded-xl text-xs w-full sm:w-72 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all text-slate-800"
          />
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold">
              <tr>
                <th className="px-6 py-4 text-slate-500">TIMESTAMP</th>
                <th className="px-6 py-4 text-slate-500">SOURCE</th>
                <th className="px-6 py-4 text-slate-500">EVENT TYPE</th>
                <th className="px-6 py-4 text-slate-500">DEVICE ID</th>
                <th className="px-6 py-4 text-slate-500">DETAILS</th>
                <th className="px-6 py-4 text-slate-500 text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors group cursor-pointer">
                  <td className="px-6 py-4 whitespace-nowrap">{row.timestamp}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-slate-450">
                        {row.isSystem ? 'robot_2' : 'person_check'}
                      </span>
                      <span className="text-slate-900 font-semibold">{row.user}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight border ${row.typeColor}`}>
                      {row.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-slate-500">{row.unit}</td>
                  <td className={`px-6 py-4 ${row.type === 'Sensor Alert' ? 'text-red-655 font-bold' : 'text-slate-700'}`}>
                    {row.details}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className={`inline-flex items-center gap-1 px-3 py-0.5 rounded-full border ${row.statusColor}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      <span className="text-[10px] font-bold">{row.status}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between text-xs font-medium">
          <span className="text-slate-500 font-bold">Showing {filteredRows.length} of {rows.length} events</span>
        </div>
      </section>
    </div>
  );
}

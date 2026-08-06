'use client'

import React from 'react'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import KPICard from '@/components/admin/KPICard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { IncidentsOverviewLineChart, WashroomHealthDonutChart } from '@/components/admin/Charts'
import { Building2, AlertTriangle, Cpu, ArrowRight, ShieldAlert, Zap } from 'lucide-react'
import { severityBadgeClass } from '@/lib/utils'
import { useDASummary, useDAIncidents } from '@/hooks/useDAEngine'
import { useRealtime } from '@/hooks/useRealtime'

function computeWeeklyIncidents(incidents: any[]) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const recent = incidents.filter(i => new Date(i.timestamp) >= weekAgo)
  return days.map(day => ({
    day,
    incidents: recent.filter(i => {
      const d = new Date(i.timestamp)
      return d.toLocaleDateString('en', { weekday: 'short' }).startsWith(day)
    }).length,
  }))
}

function computeWashroomStatusDistribution(washroomList: any[]) {
  const vacant = washroomList.filter((w: any) => {
    const occ = w.latest_sensors?.occupancy ?? w.occupancy ?? 0
    return w.status === 'Good' && occ === 0
  }).length
  const occupied = washroomList.filter((w: any) => {
    const occ = w.latest_sensors?.occupancy ?? w.occupancy ?? 0
    return occ > 0
  }).length
  const cleaning = washroomList.filter((w: any) => w.status === 'Fair').length
  const outOfOrder = washroomList.filter((w: any) => w.status === 'Critical').length
  return [
    { name: 'Vacant', value: vacant, color: '#22C55E' },
    { name: 'Occupied', value: occupied, color: '#EF4444' },
    { name: 'Cleaning', value: cleaning, color: '#F59E0B' },
    { name: 'Out of Order', value: outOfOrder, color: '#475569' },
  ]
}

export default function DashboardPage() {
  // Primary: real-time WebSocket data
  const realtime = useRealtime()
  // Fallback: React Query polling (when WebSocket is disconnected)
  const { data: fallbackSummary, isLoading: summaryLoading, error: summaryError } = useDASummary()
  const { data: fallbackIncidents = [], isLoading: incidentsLoading } = useDAIncidents()

  // Use real-time data if available, fallback to polling
  const summary = realtime.telemetry.length > 0
    ? {
        total_washrooms: realtime.telemetry.length,
        online_devices: realtime.telemetry.filter(t => t.battery_pct > 0).length,
        critical_count: realtime.telemetry.filter(t => t.whi_score < 60).length,
        warning_count: realtime.telemetry.filter(t => t.whi_score >= 60 && t.whi_score < 80).length,
        good_count: realtime.telemetry.filter(t => t.whi_score >= 80).length,
        avg_whi: realtime.summary?.avg_whi ?? (realtime.telemetry.reduce((s, t) => s + t.whi_score, 0) / (realtime.telemetry.length || 1)),
        airport_whi: realtime.summary?.avg_whi ?? 0,
        washroom_list: realtime.telemetry.map(t => ({
          device_id: t.device_id,
          terminal: t.terminal_id,
          level: t.floor_level,
          whi: t.whi_score,
          status: t.whi_score >= 80 ? 'Good' : t.whi_score >= 60 ? 'Fair' : 'Critical',
          latest_sensors: { occupancy: t.occupancy_count },
        })),
        terminals: [],
      }
    : fallbackSummary

  const incidents = realtime.incidents.length > 0
    ? realtime.incidents
    : Array.isArray(fallbackIncidents) ? fallbackIncidents : []

  const loading = !realtime.connected && (summaryLoading || incidentsLoading)
  const error = !realtime.connected && (summaryError || !summary)

  if (loading) return <LoadingSpinner text="Retrieving admin diagnostics..." />
  if (error || !summary) {
    return (
      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">
        Failed to load dashboard metrics.
      </div>
    )
  }

  const weeklyIncidentsData = computeWeeklyIncidents(incidents)
  const washroomStatusData = computeWashroomStatusDistribution(summary?.washroom_list || [])

  const displayIncidents = incidents.slice(0, 5).map((inc: any, idx: number) => ({
    id: `${inc.device_id || inc.washroom_id}-${inc.incident_type || inc.new_state}-${idx}`,
    title: inc.description || inc.incident_type || `${inc.old_state} → ${inc.new_state}`,
    severity: inc.severity === 'CRITICAL' || inc.new_state === 'ACTIVE_INCIDENT' ? 'CRITICAL' : 'HIGH',
    status: 'OPEN',
    terminal: inc.terminal,
    assignedTo: 'Unassigned',
    timestamp: inc.timestamp,
  }))

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Admin Dashboard"
        subtitle="Global status monitoring, active incident queue, and telemetry analysis."
        actions={
          realtime.connected ? (
            <span className="flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
              <Zap size={12} className="animate-pulse" />
              Live — Real-time connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
              Polling — 30s intervals
            </span>
          )
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <Link href="/admin/terminals">
          <KPICard
            title="Total Terminals"
            value={summary.terminals?.length || new Set((summary.washroom_list || []).map((w: any) => w.terminal)).size || 3}
            icon={<Building2 size={20} />}
            color="blue"
            trend={`${summary.total_washrooms} washrooms`}
            trendDirection="up"
          />
        </Link>
        <Link href="/admin/incidents">
          <KPICard
            title="Active Incidents"
            value={summary.critical_count}
            icon={<AlertTriangle size={20} />}
            color="yellow"
            trend="Priority Queued"
            trendDirection="down"
          />
        </Link>
        <Link href="/admin/critical-alerts">
          <KPICard
            title="Critical Alerts"
            value={summary.critical_count}
            icon={<ShieldAlert size={20} />}
            color="red"
            trend="Immediate Action"
            trendDirection="down"
            linkText="View all &rarr;"
          />
        </Link>
        <Link href="/admin/devices">
          <KPICard
            title="Online Sensors"
            value={`${summary.online_devices}/${summary.total_washrooms}`}
            icon={<Cpu size={20} />}
            color="green"
            trend="Active Telemetry Nodes"
            trendDirection="up"
          />
        </Link>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7">
          <DataCard
            title="Incidents Overview (This Week)"
            subtitle="Weekly aggregate rate of reports logged across all terminals."
          >
            <IncidentsOverviewLineChart data={weeklyIncidentsData} />
            <div className="flex gap-4 mt-6 justify-center">
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span> Critical
              </div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"></span> Urgent
              </div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block"></span> Medium
              </div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span> Low
              </div>
            </div>
          </DataCard>
        </div>

        <div className="col-span-12 lg:col-span-5">
          <DataCard
            title="Washroom Health Overview"
            subtitle="Current distribution of washroom status across all active facility nodes."
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <WashroomHealthDonutChart data={washroomStatusData} centerLabel="Washrooms" />
              <div className="space-y-3 w-full sm:w-auto shrink-0 font-sans">
                {washroomStatusData.map((item, index) => (
                  <div key={index} className="flex justify-between items-center gap-6 group text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: item.color }} />
                      <span className="text-xs font-medium">{item.name}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-500 font-mono">{item.value} Units</span>
                  </div>
                ))}
              </div>
            </div>
          </DataCard>
        </div>

        <div className="col-span-12">
          <DataCard
            title="Recent Incidents"
            subtitle="Latest system alerts logged on our networks."
            actions={
              <Link href="/admin/incidents" className="text-blue-600 hover:text-blue-700 text-xs font-bold flex items-center gap-1">
                View All <ArrowRight size={14} />
              </Link>
            }
          >
            {displayIncidents.length === 0 ? (
              <EmptyState title="No Incidents Found" description="System is reporting clear diagnostic readings." icon={AlertTriangle} />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                    <tr>
                      <th className="px-6 py-4 font-semibold uppercase tracking-wider">Incident Ref</th>
                      <th className="px-6 py-4 font-semibold uppercase tracking-wider">Terminal</th>
                      <th className="px-6 py-4 font-semibold uppercase tracking-wider">Severity</th>
                      <th className="px-6 py-4 font-semibold uppercase tracking-wider">Assigned Tech</th>
                      <th className="px-6 py-4 font-semibold uppercase tracking-wider">Timestamp</th>
                      <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                    {displayIncidents.map((incident) => (
                      <tr key={incident.id} className="hover:bg-slate-55 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-900 font-mono">#{incident.id}</td>
                        <td className="px-6 py-4 text-xs font-semibold text-slate-800">{incident.terminal}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 text-[9px] font-bold rounded-full uppercase border ${severityBadgeClass(incident.severity)}`}>
                            {incident.severity}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium">{incident.assignedTo}</td>
                        <td className="px-6 py-4 text-xs text-slate-500 font-mono">{new Date(incident.timestamp).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/admin/incidents`}
                            className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 hover:border-slate-350 hover:bg-slate-50 transition-colors text-blue-650"
                          >
                            <ArrowRight size={14} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DataCard>
        </div>
      </div>
    </div>
  )
}

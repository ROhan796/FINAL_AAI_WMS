'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { statusColor } from '@/lib/utils'
import { Bath, AlertTriangle, Cpu, TrendingDown, CheckCircle2, ArrowRight, Plus, Users, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDASummary, useDAIncidents } from '@/hooks/useDAEngine'
import { useRealtime } from '@/hooks/useRealtime'

interface FloorStatus {
  terminal: string
  floor: string
  status: string
  active_incidents: number
}

interface WMSStatus {
  floors: FloorStatus[]
  total_active_floors: number
}

interface WashroomDisplay {
  id: string
  name: string
  whi: number
  status: string
  occupancy: number
  footTraffic: number
  gender: string
  gateNumber: string
  timestamp: string
}

export default function TerminalDashboard() {
  const router = useRouter()
  const realtime = useRealtime()
  const { data: fallbackSummary, isLoading: summaryLoading } = useDASummary()
  const { data: fallbackIncidents = [], isLoading: incidentsLoading } = useDAIncidents()

  const loading = !realtime.connected && (summaryLoading || incidentsLoading)

  // Use real-time data if available, fallback to polling
  const summary = (() => {
    if (realtime.telemetry.length === 0) return fallbackSummary
    
    // Deduplicate telemetry by device_id
    const uniqueTelemetry = Array.from(
      new Map(realtime.telemetry.map(t => [t.device_id, t])).values()
    )
    
    return {
      total_washrooms: uniqueTelemetry.length,
      online_devices: uniqueTelemetry.filter(t => t.battery_pct > 0).length,
      critical_count: uniqueTelemetry.filter(t => t.whi_score < 60).length,
      avg_whi: realtime.summary?.avg_whi ?? (uniqueTelemetry.reduce((s, t) => s + t.whi_score, 0) / (uniqueTelemetry.length || 1)),
      airport_whi: realtime.summary?.avg_whi ?? 0,
      washroom_list: uniqueTelemetry.map(t => ({
        device_id: t.device_id,
        terminal: t.terminal_id,
        level: t.floor_level,
        type: t.device_id.includes('PPF') ? 'PPF' : t.device_id.includes('PPD') ? 'PPD' : 'PPM',
        whi: t.whi_score,
        status: t.whi_score >= 80 ? 'Good' : t.whi_score >= 60 ? 'Fair' : 'Critical',
        latest_sensors: { occupancy: t.occupancy_count },
      })),
    }
  })()

  const incidents = realtime.incidents.length > 0
    ? realtime.incidents
    : Array.isArray(fallbackIncidents) ? fallbackIncidents : []

  // Use real-time floor status from WMS Backend WebSocket
  const floorStatus = realtime.floorStatus

  if (loading) {
    return <LoadingSpinner text="Connecting to on-site terminal telemetry..." />
  }

  const displayWashrooms: WashroomDisplay[] = (summary?.washroom_list || [])
    .filter((w: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.device_id === w.device_id) === i)
    .map((w: any) => ({
    id: w.device_id,
    name: `${w.terminal} ${w.level} ${w.type}`,
    whi: Math.round(w.whi),
    status: w.status || (w.whi >= 80 ? 'Good' : w.whi >= 60 ? 'Fair' : 'Critical'),
    occupancy: w.latest_sensors?.occupancy || 0,
    footTraffic: w.latest_sensors?.occupancy || 0,
    gender: w.type === 'PPF' ? 'Ladies' : 'Gents',
    gateNumber: w.level || 'N/A',
    timestamp: new Date().toISOString(),
  }))

  const activeIncidents = incidents.filter((inc: any) => inc.severity === 'CRITICAL' || inc.severity === 'WARNING')
  const totalFootTraffic = displayWashrooms.reduce((sum, w) => sum + w.footTraffic, 0)

  const getStatusColor = (whi: number) => {
    if (whi >= 80) return { bg: 'bg-green-500', text: 'text-green-650', border: 'border-green-200' }
    if (whi >= 60) return { bg: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-200' }
    return { bg: 'bg-red-500', text: 'text-red-650', border: 'border-red-200' }
  }

  return (
    <div className="space-y-6 font-sans text-sm">
      <PageHeader
        title="Terminal Operator Control"
        subtitle="Live terminal metrics, smart washroom tracking, and operator overrides."
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div
          onClick={() => router.push('/terminal/washrooms')}
          className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col justify-between h-32 hover:shadow-md hover:border-slate-300 hover:scale-[1.02] cursor-pointer transition-all shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Washrooms</span>
            <Bath className="text-blue-600" size={18} />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-mono">{displayWashrooms.length}</div>
          <div className="text-[10px] text-green-650 flex items-center gap-1 font-bold">
            <CheckCircle2 size={12} />
            <span>All nodes operational</span>
          </div>
        </div>

        <div
          onClick={() => router.push('/terminal/incidents')}
          className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col justify-between h-32 hover:shadow-md hover:border-slate-300 hover:scale-[1.02] cursor-pointer transition-all shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Incidents</span>
            <AlertTriangle className="text-amber-650" size={18} />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-mono">{activeIncidents.length}</div>
          <div className="text-[10px] text-amber-650 flex items-center gap-1 font-bold">
            <AlertTriangle size={12} className="animate-pulse" />
            <span>Action Required</span>
          </div>
        </div>

        <div
          onClick={() => router.push('/terminal/device-status')}
          className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col justify-between h-32 hover:shadow-md hover:border-slate-300 hover:scale-[1.02] cursor-pointer transition-all shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Online Devices</span>
            <Cpu className="text-emerald-600" size={18} />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-mono">{summary?.online_devices ?? 0}</div>
          <div className="text-[10px] text-slate-500 flex items-center gap-1 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>98.5% network uptime</span>
          </div>
        </div>

        <div
          onClick={() => router.push('/terminal/live-whi')}
          className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col justify-between h-32 hover:shadow-md hover:scale-[1.02] cursor-pointer transition-all shadow-sm border-l-4 border-l-red-500 bg-red-50/15"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-650 uppercase tracking-wider">Hygiene Index</span>
            <TrendingDown className="text-red-600" size={18} />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-mono">{Math.round(summary?.airport_whi ?? 0)}%</div>
          <div className="text-[10px] text-red-655 flex items-center gap-1 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span>{summary?.critical_count ?? 0} critical nodes</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <DataCard
            title="Interactive Zone Map"
            subtitle="Concourse live view heatmap highlighting foot traffic and WHI by zone."
            actions={
              <Link href="/terminal/floor-heatmap" className="text-xs text-blue-600 font-semibold hover:text-blue-700 hover:underline flex items-center gap-1">
                View Full Map <ArrowRight size={14} />
              </Link>
            }
          >
            <div className="relative h-96 bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
              <img
                alt="Terminal Heatmap"
                className="w-full h-full object-cover opacity-40 grayscale select-none pointer-events-none"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCoRPynPA7-uwaznrB91MN2H3_Z8Vk89xf3FiiWbH_4x0wBa5lBSvGdQ1BlC_HG83KT7ikt3--JoolykLR-ftftawO9lwDBJGRyB22I_RyyOa5CXLZT-B41rdVZPu-MHByaUaRxY88q7TGmE_a30hifVac8fWs8e0ZD5-Cinr4EaVPPjVtC5KsC9uOJSv4UX8iWqGLdpsnfZbLtkCIVmizTIRZjPQeA4kPIRMFm-qVvXfsy-3T_S8PcnxlgFwc25UIOpCvtRrsqzfU"
              />
              {displayWashrooms.slice(0, 8).map((w: WashroomDisplay, index: number) => {
                const positions = [
                  { top: '20%', left: '15%' },
                  { top: '35%', left: '45%' },
                  { top: '60%', left: '22%' },
                  { top: '45%', left: '70%' },
                  { top: '75%', left: '55%' },
                  { top: '25%', left: '75%' },
                  { top: '55%', left: '40%' },
                  { top: '70%', left: '80%' },
                ]
                const pos = positions[index % positions.length]
                const sc = getStatusColor(w.whi)

                return (
                  <div
                    key={w.id}
                    onClick={() => router.push(`/terminal/washrooms/total-detail?device_id=${w.id}`)}
                    style={{ top: pos.top, left: pos.left }}
                    className="absolute p-2.5 bg-white/90 backdrop-blur-sm border border-slate-200 text-slate-900 rounded-xl shadow-md flex flex-col gap-0.5 cursor-pointer hover:scale-105 active:scale-95 transition-all font-sans select-none hover:border-slate-350 z-10"
                  >
                    <span className="text-[10px] font-extrabold text-slate-800 tracking-tight">{w.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full animate-pulse",
                        w.whi < 60 ? 'bg-red-500' : w.whi < 80 ? 'bg-amber-500' : 'bg-green-500'
                      )} />
                      <span className={cn(
                        "text-[9px] font-bold uppercase",
                        w.whi < 60 ? 'text-red-655' : w.whi < 80 ? 'text-amber-600' : 'text-green-650'
                      )}>
                        WHI: {w.whi}% ({w.status})
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Users size={9} className="text-slate-400" />
                      <span className="text-[8px] text-slate-500 font-medium">{w.footTraffic} visitors</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex items-center justify-between text-[10px] text-slate-500 font-bold">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-green-500 rounded-sm"></span>
                  <span>Good (WHI ≥ 80)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-amber-500 rounded-sm"></span>
                  <span>Warning (WHI 60-79)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-red-500 rounded-sm"></span>
                  <span>Critical (WHI &lt; 60)</span>
                </div>
              </div>
              <span className="text-slate-400">Total foot traffic: {totalFootTraffic}</span>
            </div>
          </DataCard>
        </div>

        <div className="lg:col-span-4">
          <DataCard
            title="Live WHI Feed"
            subtitle="Recent hygiene evaluations across active facilities."
            actions={
              <Link href="/terminal/live-whi" className="text-xs text-blue-600 font-semibold hover:text-blue-700 hover:underline flex items-center gap-1">
                Details <ArrowRight size={14} />
              </Link>
            }
          >
            <div className="space-y-4 overflow-y-auto max-h-80 custom-scrollbar pr-1">
              {displayWashrooms.slice(0, 4).map((w: WashroomDisplay) => (
                <div
                  key={w.id}
                  className={cn(
                    "p-4 rounded-xl bg-slate-50 border-l-4 transition-colors hover:bg-slate-100 border border-slate-200",
                    w.whi < 60 ? 'border-l-red-500 border-red-200' : w.whi < 80 ? 'border-l-yellow-500 border-yellow-250' : 'border-l-green-500 border-green-200'
                  )}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-bold text-slate-900">{w.name}</span>
                    <span className={cn(
                      "text-xs font-mono font-bold",
                      w.whi < 60 ? 'text-red-650' : w.whi < 80 ? 'text-amber-600' : 'text-green-600'
                    )}>WHI {w.whi}%</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Status: <span className="font-semibold text-slate-700">{w.status}</span> &bull; Occupancy: <span className="font-semibold text-slate-700">{w.occupancy}</span>
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <Users size={10} className="text-slate-400" />
                    <span className="text-[10px] text-slate-500">{w.footTraffic} visitors &bull; {w.gender} &bull; {w.gateNumber}</span>
                  </div>
                </div>
              ))}
            </div>
          </DataCard>
        </div>

        <div className="col-span-12">
          <DataCard
            title="Floor Status (WMS Backend)"
            subtitle={realtime.connected ? "Real-time floor state via WebSocket." : "Floor state from REST API (polling)."}
          >
            {floorStatus && floorStatus.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {floorStatus.map((floor, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "p-3 rounded-xl border transition-colors",
                      floor.status === 'FLOOR_CRITICAL'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-green-50 border-green-200'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700">{floor.terminal} — {floor.floor}</span>
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        floor.status === 'FLOOR_CRITICAL' ? 'bg-red-500 animate-pulse' : 'bg-green-500'
                      )} />
                    </div>
                    <p className={cn(
                      "text-[10px] font-semibold uppercase",
                      floor.status === 'FLOOR_CRITICAL' ? 'text-red-600' : 'text-green-600'
                    )}>
                      {floor.status.replace('_', ' ')}
                    </p>
                    {floor.active_incidents > 0 && (
                      <p className="text-[10px] text-red-500 mt-1">{floor.active_incidents} incident(s)</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">
                {realtime.connected ? 'Awaiting floor status data...' : 'WMS Backend not connected — floor status unavailable'}
              </p>
            )}
          </DataCard>
        </div>

        <div className="col-span-12">
          <DataCard
            title="Active Incidents Queue"
            subtitle="Alerts logged on on-site hardware network."
            actions={
              <button
                onClick={() => router.push('/terminal/incidents')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all text-xs active:scale-[0.98] shadow-sm cursor-pointer"
              >
                <Plus size={14} /> New Incident
              </button>
            }
          >
            {activeIncidents.length === 0 ? (
              <EmptyState title="No active alerts logged" description="All terminals are reporting stable status." icon={CheckCircle2} />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                    <tr>
                      <th className="px-6 py-4 font-semibold uppercase tracking-wider">Device</th>
                      <th className="px-6 py-4 font-semibold uppercase tracking-wider">Severity</th>
                      <th className="px-6 py-4 font-semibold uppercase tracking-wider">Terminal</th>
                      <th className="px-6 py-4 font-semibold uppercase tracking-wider">Description</th>
                      <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                    {activeIncidents.slice(0, 5).map((incident: any, idx: number) => (
                      <tr
                        key={idx}
                        onClick={() => router.push(`/terminal/washrooms/total-detail?device_id=${incident.device_id}`)}
                        className="hover:bg-slate-50 transition-colors cursor-pointer group"
                      >
                        <td className="px-6 py-4 font-mono font-bold text-slate-900">{incident.device_id}</td>
                        <td className="px-6 py-4">
                          <span className={cn("px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase border", statusColor(incident.severity))}>
                            {incident.severity}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs">{incident.terminal}</td>
                        <td className="px-6 py-4 font-semibold text-slate-800">{incident.description}</td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-blue-600 group-hover:translate-x-1 transition-all inline-block">&rarr;</span>
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

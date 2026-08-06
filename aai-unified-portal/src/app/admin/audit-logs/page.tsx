'use client'

import React, { useState, useEffect } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import SystemHealthCard from '@/components/admin/SystemHealthCard'
import LiveActivityMap from '@/components/admin/LiveActivityMap'
import { statusColor } from '@/lib/utils'
import { ShieldCheck, Search, Radio, AlertTriangle, ArrowUp, Database, Activity, HeartPulse } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRealtime } from '@/hooks/useRealtime'

interface AuditLog {
  id: string
  timestamp: string
  user?: string
  userId?: string
  action: string
  ip: string
  details: string
  severity: string
}

interface RawTelemetryEntry {
  received_at: string
  topic: string
  raw_payload: string
}

interface IncidentEventEntry {
  time: string
  washroom_id: string
  terminal: string
  old_state: string
  new_state: string
  whi: number
}

interface FloorEscalationEntry {
  time: string
  floor: string
  terminal: string
  old_status: string
  new_status: string
  active_incident_count: number
}

type AuditTab = 'system' | 'raw-telemetry' | 'incidents' | 'escalations' | 'live-activity' | 'system-health'

export default function AuditLogsPage() {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [rawTelemetry, setRawTelemetry] = useState<RawTelemetryEntry[]>([])
  const [incidentEvents, setIncidentEvents] = useState<IncidentEventEntry[]>([])
  const [floorEscalations, setFloorEscalations] = useState<FloorEscalationEntry[]>([])
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [activeTab, setActiveTab] = useState<AuditTab>('system')
  const [wmsConnected, setWmsConnected] = useState(false)
  const { incidents: rtIncidents } = useRealtime()

  useEffect(() => {
    if (rtIncidents && rtIncidents.length > 0) {
      const mapped: IncidentEventEntry[] = rtIncidents.map((inc: any) => ({
        time: inc.timestamp,
        washroom_id: inc.washroom_id || inc.device_id || '',
        terminal: inc.terminal,
        old_state: inc.old_state || '',
        new_state: inc.new_state || inc.severity || '',
        whi: inc.whi || 0,
      }))
      setIncidentEvents((prev: IncidentEventEntry[]) => {
        const merged = [...mapped, ...prev]
        const deduped = merged.filter((item: IncidentEventEntry, index: number, self: IncidentEventEntry[]) =>
          index === self.findIndex((t: IncidentEventEntry) =>
            t.washroom_id === item.washroom_id && t.time === item.time
          )
        )
        return deduped.slice(0, 200)
      })
    }
  }, [rtIncidents])

  useEffect(() => {
    async function loadData() {
      try {
        const [sysRes, rawRes, incRes, escRes] = await Promise.all([
          fetch('/api/audit-logs?limit=50', { cache: 'no-store' }),
          fetch('/api/wms/audit/raw-telemetry?hours=24&limit=50', { cache: 'no-store' }),
          fetch('/api/wms/audit/incident-events?hours=24&limit=50', { cache: 'no-store' }),
          fetch('/api/wms/audit/floor-escalations?hours=24&limit=50', { cache: 'no-store' }),
        ])

        if (sysRes.ok) {
          const data = await sysRes.json()
          const mapped: AuditLog[] = (Array.isArray(data) ? data : []).map((log: any) => ({
            id: String(log.id),
            timestamp: log.timestamp,
            userId: log.userId || log.user_id || 'SYSTEM',
            action: log.eventType || log.event_type || 'SYSTEM_EVENT',
            ip: log.ipAddress || log.ip_address || '-',
            details: log.details || '-',
            severity: log.severity || 'INFO',
          }))
          setLogs(mapped)
        }
        if (rawRes.ok) {
          const data = await rawRes.json()
          setRawTelemetry(Array.isArray(data) ? data : [])
          setWmsConnected(true)
        }
        if (incRes.ok) {
          const data = await incRes.json()
          setIncidentEvents(Array.isArray(data) ? data : [])
        }
        if (escRes.ok) {
          const data = await escRes.json()
          setFloorEscalations(Array.isArray(data) ? data : [])
        }
      } catch {
        console.warn('Audit endpoints not fully available')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.user?.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      log.details.toLowerCase().includes(search.toLowerCase()) ||
      log.ip.includes(search)
    const matchesSeverity = severityFilter === 'ALL' || log.severity === severityFilter
    return matchesSearch && matchesSeverity
  })

  const filteredTelemetry = rawTelemetry.filter((entry) =>
    !search || entry.topic.toLowerCase().includes(search.toLowerCase()) ||
    entry.raw_payload.toLowerCase().includes(search.toLowerCase())
  )

  const filteredIncidents = incidentEvents.filter((entry) =>
    !search || entry.washroom_id.toLowerCase().includes(search.toLowerCase()) ||
    entry.terminal.toLowerCase().includes(search.toLowerCase())
  )

  const filteredEscalations = floorEscalations.filter((entry) =>
    !search || entry.floor.toLowerCase().includes(search.toLowerCase()) ||
    entry.terminal.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return <LoadingSpinner text="Retrieving operational audit registers..." />
  }

  const tabs: { key: AuditTab; label: string; icon: any; count: number }[] = [
    { key: 'system', label: 'System Logs', icon: Database, count: logs.length },
    { key: 'raw-telemetry', label: 'Raw Telemetry', icon: Radio, count: rawTelemetry.length },
    { key: 'incidents', label: 'Incident Events', icon: AlertTriangle, count: incidentEvents.length },
    { key: 'escalations', label: 'Floor Escalations', icon: ArrowUp, count: floorEscalations.length },
    { key: 'live-activity', label: 'Live Activity', icon: Activity, count: 0 },
    { key: 'system-health', label: 'System Health', icon: HeartPulse, count: 0 },
  ]

  return (
    <div className="space-y-6 font-sans text-sm">
      <PageHeader
        title="System Audit Logs"
        subtitle="Chronological register of security actions, metadata shifts, and system states."
      />

      <div className="flex flex-col sm:flex-row gap-4 justify-between bg-white border border-slate-200 p-4 rounded-xl items-center shadow-sm">
        <div className="flex flex-wrap gap-3 items-center w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search audit trail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all w-full"
            />
          </div>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all cursor-pointer"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
            <option value="INFO">Info</option>
          </select>
        </div>
        {wmsConnected && (
          <span className="text-xs text-green-600 font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            WMS Backend Connected
          </span>
        )}
      </div>

      <div className="flex gap-2 bg-slate-50 border border-slate-200 p-1 rounded-xl overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all cursor-pointer whitespace-nowrap",
              activeTab === tab.key
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <tab.icon size={12} />
            {tab.label}
            {tab.count > 0 && <span className="text-[9px] opacity-70">({tab.count})</span>}
          </button>
        ))}
      </div>

      {activeTab === 'system' && (
        <DataCard title="System Audit Trail" subtitle="Database-backed audit records from Clerk sync.">
          {filteredLogs.length === 0 ? (
            <EmptyState title="No Records Found" description="Try adjusting your query filter parameters." icon={ShieldCheck} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Timestamp</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">User Entity</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Action Type</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">IP Address</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Details</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{log.timestamp}</td>
                      <td className="px-5 py-3.5 font-bold text-slate-900 whitespace-nowrap">{log.user || log.userId}</td>
                      <td className="px-5 py-3.5 text-blue-600 font-semibold whitespace-nowrap">{log.action}</td>
                      <td className="px-5 py-3.5 text-slate-550 whitespace-nowrap">{log.ip}</td>
                      <td className="px-5 py-3.5 text-slate-650">{log.details}</td>
                      <td className="px-5 py-3.5">
                        <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border", statusColor(log.severity))}>
                          {log.severity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataCard>
      )}

      {activeTab === 'raw-telemetry' && (
        <DataCard title="Raw MQTT Telemetry Audit" subtitle="Raw sensor messages from IoT devices via EMQX (14-day retention).">
          {filteredTelemetry.length === 0 ? (
            <EmptyState title="No Raw Telemetry" description={wmsConnected ? "No telemetry received in the last 24 hours." : "WMS Backend not connected."} icon={Radio} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Received At</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">MQTT Topic</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Raw Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredTelemetry.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{new Date(entry.received_at).toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-blue-600 font-semibold whitespace-nowrap">{entry.topic}</td>
                      <td className="px-5 py-3.5 text-slate-650 truncate max-w-md">{entry.raw_payload}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataCard>
      )}

      {activeTab === 'incidents' && (
        <DataCard title="Incident State Transitions" subtitle="Audit trail of all incident state changes from the WMS Backend IncidentEngine.">
          {filteredIncidents.length === 0 ? (
            <EmptyState title="No Incident Events" description={wmsConnected ? "No incidents recorded in the last 24 hours." : "WMS Backend not connected."} icon={AlertTriangle} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Time</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Washroom ID</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Terminal</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Old State</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">New State</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">WHI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredIncidents.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{new Date(entry.time).toLocaleString()}</td>
                      <td className="px-5 py-3.5 font-bold text-slate-900 whitespace-nowrap">{entry.washroom_id}</td>
                      <td className="px-5 py-3.5 text-blue-600 whitespace-nowrap">{entry.terminal}</td>
                      <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{entry.old_state}</td>
                      <td className="px-5 py-3.5">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border",
                          entry.new_state === 'ACTIVE_INCIDENT' ? 'bg-red-50 text-red-600 border-red-200' :
                          entry.new_state === 'RESOLVED' ? 'bg-green-50 text-green-600 border-green-200' :
                          'bg-slate-50 text-slate-600 border-slate-200'
                        )}>
                          {entry.new_state}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-600">{entry.whi.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataCard>
      )}

      {activeTab === 'escalations' && (
        <DataCard title="Floor Escalation Events" subtitle="Floor-level escalation alerts from the WMS Backend EscalationEngine.">
          {filteredEscalations.length === 0 ? (
            <EmptyState title="No Escalation Events" description={wmsConnected ? "No escalations recorded in the last 24 hours." : "WMS Backend not connected."} icon={ArrowUp} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Time</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Floor</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Terminal</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Old Status</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">New Status</th>
                    <th className="px-5 py-4 font-semibold uppercase tracking-wider">Active Incidents</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredEscalations.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{new Date(entry.time).toLocaleString()}</td>
                      <td className="px-5 py-3.5 font-bold text-slate-900 whitespace-nowrap">{entry.floor}</td>
                      <td className="px-5 py-3.5 text-blue-600 whitespace-nowrap">{entry.terminal}</td>
                      <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{entry.old_status}</td>
                      <td className="px-5 py-3.5">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border",
                          entry.new_status === 'FLOOR_CRITICAL' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-600 border-green-200'
                        )}>
                          {entry.new_status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-600 text-center">{entry.active_incident_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataCard>
      )}

      {activeTab === 'live-activity' && (
        <DataCard title="Live Activity Map" subtitle="Real-time audit log activity by terminal location.">
          <LiveActivityMap terminal="T2" />
        </DataCard>
      )}

      {activeTab === 'system-health' && (
        <DataCard title="System Health" subtitle="Real-time infrastructure status indicators.">
          <SystemHealthCard />
        </DataCard>
      )}
    </div>
  )
}

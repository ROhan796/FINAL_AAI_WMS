'use client'

import React, { useState, useEffect } from 'react'
import LogsTable from '@/components/audit/LogsTable'
import KPICard from '@/components/admin/KPICard'
import PageHeader from '@/components/ui/PageHeader'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { History, ShieldCheck, ShieldAlert, Key } from 'lucide-react'
import { useRealtime } from '@/hooks/useRealtime'
import type { LogEntry, LogSeverity } from '@/types'

export default function AuditDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const { incidents: realtimeIncidents } = useRealtime()

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch from multiple sources for comprehensive audit logs
        const [daRes, auditRes, systemRes] = await Promise.allSettled([
          fetch('/api/da/incidents'),
          fetch('/api/audit-logs?limit=100'),
          fetch('/api/wms/audit/incident-events?hours=24&limit=100'),
        ])

        const allLogs: LogEntry[] = []

        // Process DA Engine incidents
        if (daRes.status === 'fulfilled' && daRes.value.ok) {
          const data = await daRes.value.json()
          const daLogs: LogEntry[] = (data.incidents || data || []).map((inc: any, idx: number) => ({
            id: `da-${inc.id || inc.device_id || `inc-${idx}`}`,
            timestamp: inc.created_at || inc.timestamp || new Date().toISOString(),
            eventType: inc.incident_type || inc.severity || 'SYSTEM_EVENT',
            severity: (inc.severity === 'CRITICAL' ? 'CRITICAL' : inc.severity === 'HIGH' ? 'WARNING' : 'INFO') as LogSeverity,
            userId: 'SYS_SENSOR',
            ip: 'api://da-engine',
            details: inc.description || `${inc.incident_type || 'Incident'}: WHI ${inc.whi || 0}`,
          }))
          allLogs.push(...daLogs)
        }

        // Process system/audit logs from database
        if (auditRes.status === 'fulfilled' && auditRes.value.ok) {
          const data = await auditRes.value.json()
          const dbLogs: LogEntry[] = (Array.isArray(data) ? data : []).map((log: any, idx: number) => ({
            id: `db-${log.id || `log-${idx}`}`,
            timestamp: log.timestamp || new Date().toISOString(),
            eventType: log.eventType || log.event_type || log.action || 'USER_ACTION',
            severity: (log.severity || 'INFO') as LogSeverity,
            userId: log.userId || log.user_id || 'SYSTEM',
            ip: log.ipAddress || log.ip_address || '-',
            details: log.details || '-',
          }))
          allLogs.push(...dbLogs)
        }

        // Process WMS incident events
        if (systemRes.status === 'fulfilled' && systemRes.value.ok) {
          const data = await systemRes.value.json()
          const wmsLogs: LogEntry[] = (Array.isArray(data) ? data : []).map((event: any, idx: number) => ({
            id: `wms-${event.washroom_id || `evt-${idx}`}`,
            timestamp: event.time || new Date().toISOString(),
            eventType: 'INCIDENT_STATE_CHANGE',
            severity: event.new_state === 'ACTIVE_INCIDENT' ? 'CRITICAL' : event.new_state === 'RESOLVED' ? 'INFO' : 'WARNING',
            userId: 'WMS_ENGINE',
            ip: 'api://wms-backend',
            details: `${event.washroom_id}: ${event.old_state} -> ${event.new_state} (WHI: ${event.whi})`,
          }))
          allLogs.push(...wmsLogs)
        }

        // Sort by timestamp descending
        allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

        setLogs(allLogs)
      } catch (err) {
        console.error('Error fetching audit logs:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    if (realtimeIncidents.length > 0) {
      const mapped: LogEntry[] = realtimeIncidents.map((inc: any, idx: number) => ({
        id: `rt-${inc.device_id || inc.washroom_id || 'unknown'}-${idx}`,
        timestamp: inc.timestamp || new Date().toISOString(),
        eventType: inc.incident_type || inc.severity || 'SYSTEM_EVENT',
        severity: inc.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
        userId: 'SYS_SENSOR',
        ip: 'ws://realtime',
        details: inc.description || `${inc.incident_type}: WHI ${inc.whi || 0}`,
      }))
      setLogs(prev => {
        if (prev.length === 0) return mapped
        const existing = new Set(prev.map(l => `${l.id}-${l.timestamp}`))
        const newOnly = mapped.filter(m => !existing.has(`${m.id}-${m.timestamp}`))
        return [...newOnly, ...prev].slice(0, 100)
      })
    }
  }, [realtimeIncidents])

  if (loading) {
    return <LoadingSpinner text="Retrieving telemetry audit databases..." />
  }

  const criticalCount = logs.filter((log) => log.severity === 'CRITICAL').length

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="System Event Logs"
        subtitle="Real-time log tracking, telemetry diagnostics, and user action trails."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Total Events Logged"
          value={logs.length}
          icon={<History size={20} />}
          color="blue"
          trend="Live tracking active"
        />
        <KPICard
          title="Critical Incidents"
          value={criticalCount}
          icon={<ShieldAlert size={20} />}
          color="red"
          trend="Requires review"
          trendDirection="down"
        />
        <KPICard
          title="System Integrity"
          value={logs.length > 0 ? `${Math.round(((logs.length - criticalCount) / logs.length) * 100)}%` : '—'}
          icon={<ShieldCheck size={20} />}
          color="green"
          trend={logs.length > 0 ? `${logs.length - criticalCount} non-critical events` : 'No data'}
          trendDirection="up"
        />
        <KPICard
          title="Active Devices"
          value={new Set(logs.map(l => l.userId)).size}
          icon={<Key size={20} />}
          color="purple"
          trend="Unique event sources"
        />
      </div>

      <div className="space-y-4">
        <LogsTable logs={logs} />
      </div>
    </div>
  )
}

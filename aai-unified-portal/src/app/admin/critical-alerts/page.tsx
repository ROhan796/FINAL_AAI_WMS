'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { ArrowLeft, CheckCircle, Eye, AlertTriangle } from 'lucide-react'
import { statusBadgeClass, severityBorderClass, timeElapsed, severityBadgeClass } from '@/lib/utils'
import { useRealtime } from '@/hooks/useRealtime'

type IncidentStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'

interface Incident {
  id: string
  terminal: string
  title: string
  severity: string
  status: IncidentStatus
  assignedTo: string
  timestamp: string
}

function getIssueType(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('moisture') || t.includes('sensor') || t.includes('pressure') || t.includes('ammonia')) return 'Sensor Fault'
  if (t.includes('leak') || t.includes('water') || t.includes('overflow')) return 'Overflow'
  if (t.includes('soap') || t.includes('paper') || t.includes('towel') || t.includes('supplies')) return 'Out of Supplies'
  if (t.includes('fan') || t.includes('lock') || t.includes('fixture') || t.includes('exhaust')) return 'Broken Fixture'
  if (t.includes('vandalism') || t.includes('broken')) return 'Vandalism'
  if (t.includes('clean') || t.includes('odor') || t.includes('moist')) return 'Cleaning Required'
  return 'Cleaning Required'
}

function getTimeElapsedClass(timestamp: string): string {
  const elapsed = timeElapsed(timestamp)
  if (elapsed.includes('d')) return 'text-slate-500'
  if (elapsed.includes('h')) {
    const hoursNum = parseInt(elapsed.split('h')[0])
    if (hoursNum >= 6) return 'text-slate-500'
    return 'text-orange-600 font-bold'
  }
  return 'text-red-600 font-bold font-mono'
}

export default function CriticalAlertsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [offlineDevicesCount, setOfflineDevicesCount] = useState(0)
  const { incidents: rtIncidents } = useRealtime()

  useEffect(() => {
    if (rtIncidents && rtIncidents.length > 0) {
      const criticalRT = rtIncidents.filter(
        (inc: any) => inc.severity === 'CRITICAL'
      ).map((inc: any) => ({
        id: `${inc.device_id || inc.washroom_id}-${inc.timestamp}`,
        terminal: inc.terminal,
        title: inc.description || inc.incident_type || 'Critical Alert',
        severity: inc.severity,
        status: 'OPEN' as IncidentStatus,
        assignedTo: 'Unassigned',
        timestamp: inc.timestamp,
      })) as Incident[]
      setIncidents((prev: Incident[]) => {
        const merged = [...criticalRT, ...prev]
        const deduped = merged.filter((item: Incident, index: number, self: Incident[]) =>
          index === self.findIndex((t: Incident) => t.id === item.id)
        )
        return deduped
      })
    }
  }, [rtIncidents])

  useEffect(() => {
    async function loadData() {
      try {
        const [incRes, sumRes] = await Promise.all([
          fetch('/api/da/incidents'),
          fetch('/api/da/summary'),
        ])
        if (incRes.ok) {
          const data = await incRes.json()
          const list = (data.incidents || data || []).map((inc: any) => ({
            id: inc.id || inc.device_id || `${inc.timestamp}`,
            terminal: inc.terminal || 'Unknown',
            title: inc.title || inc.incident_type || inc.description || 'Incident',
            severity: inc.severity || 'HIGH',
            status: (inc.status || 'OPEN') as IncidentStatus,
            assignedTo: inc.assigned_to || 'Unassigned',
            timestamp: inc.created_at || inc.timestamp || new Date().toISOString(),
          }))
          setIncidents(list)
        }
        if (sumRes.ok) {
          const data = await sumRes.json()
          const allDevices = data.washroom_list || []
          setOfflineDevicesCount(allDevices.filter((d: any) => (d.whi || 0) < 60).length)
        }
      } catch (err) {
        console.error('Error loading critical alerts registries:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) {
    return <LoadingSpinner text="Retrieving critical registers..." />
  }

  // Filter only CRITICAL severity incidents
  const criticalList = incidents.filter(x => x.severity === 'CRITICAL' && x.status !== 'RESOLVED')
  const terminalsAffected = new Set(criticalList.map(x => x.terminal)).size

  return (
    <div className="space-y-6 font-sans text-sm text-slate-700 bg-slate-50 min-h-screen p-1">
      <div className="flex justify-between items-center">
        <Link href="/admin/dashboard" className="text-blue-600 hover:underline flex items-center gap-1.5 text-xs font-bold">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </div>

      <PageHeader
        title="Critical Alerts"
        subtitle="Active critical severity incidents requiring immediate operational attention."
      />

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-red-50 border border-red-200 p-5 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-red-700 uppercase tracking-wider font-bold">Active Critical Alerts</p>
          <h3 className="text-3xl text-red-655 font-extrabold font-mono">{criticalList.length}</h3>
        </div>
        <div className="bg-orange-50 border border-orange-200 p-5 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-orange-700 uppercase tracking-wider font-bold">Avg Response Time</p>
          <h3 className="text-3xl text-orange-605 font-extrabold font-mono">
            {criticalList.length > 0
              ? (() => {
                  const resolved = criticalList.filter(i => i.status === 'RESOLVED')
                  if (resolved.length === 0) return '—'
                  const avgMs = resolved.reduce((sum, i) => {
                    const diff = new Date(i.timestamp).getTime() - Date.now()
                    return sum + Math.abs(diff)
                  }, 0) / resolved.length
                  const mins = Math.round(avgMs / 60000)
                  return mins > 0 ? `${mins}m` : '<1m'
                })()
              : '—'}
          </h3>
        </div>
        <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-amber-700 uppercase tracking-wider font-bold">Terminals Affected</p>
          <h3 className="text-3xl text-amber-605 font-extrabold font-mono">{terminalsAffected}</h3>
        </div>
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Devices Offline</p>
          <h3 className="text-3xl text-slate-900 font-extrabold font-mono">{offlineDevicesCount}</h3>
        </div>
      </div>

      {/* Main Content Table */}
      <DataCard title="Critical Incident Queue" subtitle="Real-time listing of active critical issues.">
        {criticalList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle className="w-12 h-12 text-green-400 mb-3 animate-pulse" />
            <p className="text-slate-600 font-medium">No critical alerts at this time</p>
            <p className="text-slate-400 text-sm mt-1">All systems operating normally</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                <tr>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider text-center w-12">#</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Incident ID</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Terminal</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Issue Type</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Time Elapsed</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Assigned To</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {criticalList.map((incident, rowIndex) => (
                  <tr 
                    key={incident.id} 
                    className="hover:bg-red-50/20 transition-colors border-l-4 border-l-red-500"
                  >
                    <td className="px-6 py-4 text-xs text-slate-400 font-mono text-center w-12">{rowIndex + 1}</td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">#{incident.id}</td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-800">{incident.terminal}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-red-50 text-red-700 border border-red-200 uppercase">
                        {getIssueType(incident.title)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={getTimeElapsedClass(incident.timestamp)}>
                        {timeElapsed(incident.timestamp)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-600">{incident.assignedTo}</td>
                    <td className="px-6 py-4">
                      <span className={statusBadgeClass(incident.status)}>
                        {incident.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <button
                        onClick={() => router.push(`/admin/incidents/${incident.id}`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        <Eye size={12} /> View
                      </button>
                      <button
                        onClick={() => alert(`Assigning task for #${incident.id}`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>
    </div>
  )
}

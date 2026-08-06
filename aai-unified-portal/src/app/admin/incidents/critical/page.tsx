'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { getIncidents, Incident, IncidentStatus } from '@/db'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { ShieldAlert, CheckCircle2, ArrowRight } from 'lucide-react'
import { statusColor } from '@/lib/utils'
import { useRealtime } from '@/hooks/useRealtime'

export default function CriticalAlertsPage() {
  const [loading, setLoading] = useState(true)
  const [incidents, setIncidents] = useState<Incident[]>([])
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
        return deduped.filter(x => x.severity === 'CRITICAL' && x.status !== 'RESOLVED')
      })
    }
  }, [rtIncidents])

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getIncidents()
        // Filter for CRITICAL and unresolved
        setIncidents(data.filter(x => x.severity === 'CRITICAL' && x.status !== 'RESOLVED'))
      } catch (err) {
        console.error('Error fetching critical incidents:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleResolve = (id: string) => {
    setIncidents(prev => prev.filter(x => x.id !== id))
  }

  if (loading) {
    return <LoadingSpinner text="Querying critical threat databases..." />
  }

  return (
    <div className="space-y-6 font-sans text-sm">
      <PageHeader
        title="Immediate Action Required"
        subtitle="Active P1 status anomalies requiring immediate technical dispatch."
      />

      <DataCard
        title="Priority Red Alerts"
        subtitle="Critical alerts across the airport facilities."
      >
        {incidents.length === 0 ? (
          <EmptyState title="No Critical Alerts" description="All terminal systems are reporting normal diagnostics." icon={CheckCircle2} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                <tr>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Alert ID</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Location</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Description</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Assigned Crew</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {incidents.map((incident) => (
                  <tr key={incident.id} className="hover:bg-slate-55 transition-colors border-l-2 border-l-red-500 bg-red-50/20">
                    <td className="px-6 py-5 font-mono">
                      <Link href={`/admin/incidents/${incident.id}`} className="font-bold text-slate-900 hover:underline">
                        #{incident.id}
                      </Link>
                    </td>
                    <td className="px-6 py-5 text-xs">
                      <p className="font-bold text-slate-900">{incident.terminal}</p>
                    </td>
                    <td className="px-6 py-5 text-xs text-slate-650">
                      {incident.title}
                    </td>
                    <td className="px-6 py-5 text-xs text-slate-500">
                      {incident.assignedTo}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleResolve(incident.id)}
                          className="bg-red-650 hover:bg-red-700 text-white font-semibold px-3 py-1.5 rounded-xl text-xs transition-all active:scale-[0.98] cursor-pointer shadow-sm"
                        >
                          Resolve Alert
                        </button>
                        <Link
                          href={`/admin/incidents/${incident.id}`}
                          className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 hover:border-slate-350 hover:bg-slate-50 transition-colors text-blue-600"
                        >
                          <ArrowRight size={14} />
                        </Link>
                      </div>
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

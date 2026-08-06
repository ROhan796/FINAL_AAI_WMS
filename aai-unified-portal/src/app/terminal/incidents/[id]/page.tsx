'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useRealtime } from '@/hooks/useRealtime'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { ArrowLeft, Clock, ShieldAlert, CheckCircle, Play, AlertCircle } from 'lucide-react'
import { cn, severityBadgeClass, statusBadgeClass, timeElapsed } from '@/lib/utils'

interface TimelineItem {
  title: string
  desc: string
  time: string
  status: 'resolved' | 'in-progress' | 'created'
}

interface IncidentData {
  id: string
  title: string
  terminal: string
  severity: string
  status: string
  assignedTo: string
  timestamp: string
  description?: string
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

export default function TerminalIncidentDetailPage() {
  const router = useRouter()
  const { id } = useParams()
  const incidentId = typeof id === 'string' ? id : ''
  const { incidents: rtIncidents } = useRealtime()

  const [loading, setLoading] = useState(true)
  const [incident, setIncident] = useState<IncidentData | null>(null)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])

  useEffect(() => {
    async function loadIncident() {
      if (!incidentId) return
      try {
        const res = await fetch('/api/da/incidents')
        const data = await res.json()
        const list = data.incidents || data || []
        const found = list.find((x: any) => (x.id || x.device_id) === incidentId)
        if (found) {
          const inc: IncidentData = {
            id: found.id || found.device_id,
            title: found.title || found.incident_type || found.description || 'Incident',
            terminal: found.terminal || found.device_id?.split('-')[0] || 'Unknown',
            severity: found.severity || 'HIGH',
            status: found.status || 'OPEN',
            assignedTo: found.assigned_to || 'Unassigned',
            timestamp: found.created_at || found.timestamp || new Date().toISOString(),
            description: found.description,
          }
          setIncident(inc)
          setTimeline([
            { title: 'Incident Logged', desc: inc.description || `Alert triggered on ${inc.terminal}`, time: new Date(inc.timestamp).toLocaleString(), status: 'created' },
          ])
        }
      } catch (err) {
        console.error('Error loading incident details:', err)
      } finally {
        setLoading(false)
      }
    }
    loadIncident()
  }, [incidentId])

  // Merge real-time incident updates
  useEffect(() => {
    if (!incident || rtIncidents.length === 0) return
    const rt = rtIncidents.find((r: any) => (r.device_id || r.washroom_id) === incident.id)
    if (rt && rt.timestamp !== incident.timestamp) {
      setTimeline(prev => [
        { title: 'Real-time Update', desc: rt.description || `State changed: ${rt.old_state} → ${rt.new_state}`, time: new Date(rt.timestamp).toLocaleString(), status: 'in-progress' },
        ...prev,
      ])
    }
  }, [rtIncidents, incident])

  const handleUpdateStatus = async (newStatus: 'IN_PROGRESS' | 'RESOLVED') => {
    if (!incident) return
    try {
      const action = newStatus === 'RESOLVED' ? 'resolve' : 'acknowledge'
      await fetch(`/api/wms/incidents/${incident.id}/${action}`, { method: 'POST' })
    } catch {}
    const updated = { ...incident, status: newStatus }
    setIncident(updated)
    setTimeline(prev => [
      {
        title: newStatus === 'RESOLVED' ? 'Incident Resolved' : 'Work Started',
        desc: newStatus === 'RESOLVED' ? 'Operational state restored to normal.' : 'Technician is actively addressing the issue.',
        time: 'Just Now',
        status: newStatus === 'RESOLVED' ? 'resolved' : 'in-progress'
      },
      ...prev
    ])
  }

  if (loading) {
    return <LoadingSpinner text="Retrieving incident registers..." />
  }

  if (!incident) {
    return (
      <div className="p-6 font-sans">
        <Link href="/terminal/incidents" className="text-blue-600 hover:underline flex items-center gap-1.5 text-sm mb-4 font-bold">
          <ArrowLeft size={16} /> Back to Incidents
        </Link>
        <EmptyState title="Incident Not Found" description="The requested incident could not be found." icon={ShieldAlert} />
      </div>
    )
  }

  return (
    <div className="space-y-6 font-sans text-sm text-slate-700">
      <div className="flex justify-between items-center">
        <Link href="/terminal/incidents" className="text-blue-600 hover:underline flex items-center gap-1.5 text-xs font-bold">
          <ArrowLeft size={16} /> Back to Incidents Queue
        </Link>
      </div>

      <PageHeader
        title={`Incident Details — #${incident.id}`}
        subtitle={`${incident.terminal} • Reported: ${incident.timestamp}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Summary & Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Header Details */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase border", severityBadgeClass(incident.severity))}>
                {incident.severity}
              </span>
              <span className={cn("px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase border", statusBadgeClass(incident.status))}>
                {incident.status.replace('_', ' ')}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                {getIssueType(incident.title)}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{incident.title}</h2>
            <div className="flex gap-4 text-xs text-slate-500 font-medium">
              <span className="flex items-center gap-1"><Clock size={14} /> Created: {incident.timestamp}</span>
              <span className="flex items-center gap-1"><Clock size={14} /> Elapsed: {timeElapsed(incident.timestamp)}</span>
            </div>
          </div>

          {/* Card 2: Location & Description */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-slate-800">Operational Context</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <p className="text-slate-500 font-semibold uppercase tracking-wider">Facility Location</p>
                <p className="text-slate-900 font-bold">{incident.terminal}</p>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <p className="text-slate-500 font-semibold uppercase tracking-wider">Assigned Maintenance Staff</p>
                <p className="text-slate-900 font-bold">{incident.assignedTo}</p>
              </div>
            </div>
            <div className="pt-2">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Description</p>
              <p className="text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
                Anomalous trigger registered. Environmental diagnostics reports warning index thresholds exceeded. Auto-escalation active.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Timeline & Actions */}
        <div className="space-y-6">
          {/* Card 3: Actions */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-slate-800">Incident Resolution</h3>
            <div className="space-y-2">
              {incident.status === 'OPEN' && (
                <button
                  onClick={() => handleUpdateStatus('IN_PROGRESS')}
                  className="w-full bg-blue-650 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer border-none shadow-sm transition-all"
                >
                  <Play size={16} /> Acknowledge & Start
                </button>
              )}
              {incident.status !== 'RESOLVED' && (
                <button
                  onClick={() => handleUpdateStatus('RESOLVED')}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer border-none shadow-sm transition-all"
                >
                  <CheckCircle size={16} /> Resolve Incident
                </button>
              )}
              {incident.status === 'RESOLVED' && (
                <div className="bg-green-50 border border-green-200 p-3.5 rounded-xl text-green-700 text-xs font-semibold flex items-center gap-2 shadow-sm">
                  <CheckCircle size={18} /> This incident has been fully resolved.
                </div>
              )}
            </div>
          </div>

          {/* Card 4: Timeline */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-slate-800">Activity Timeline</h3>
            <div className="space-y-4 relative pl-4 border-l border-slate-200">
              {timeline.map((item, idx) => (
                <div key={idx} className="relative space-y-1">
                  <div className={cn(
                    "absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white",
                    item.status === 'resolved' ? "bg-green-500" : item.status === 'in-progress' ? "bg-blue-500" : "bg-slate-400"
                  )} />
                  <div className="flex justify-between items-center text-xs">
                    <p className="font-bold text-slate-900">{item.title}</p>
                    <span className="text-[10px] text-slate-500 font-bold font-mono">{item.time}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-snug">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

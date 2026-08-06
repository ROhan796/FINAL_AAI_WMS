'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useRealtime } from '@/hooks/useRealtime'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { ArrowLeft, Clock, CheckCircle2, User, ShieldAlert, MessageSquare, AlertCircle } from 'lucide-react'
import { cn, statusColor } from '@/lib/utils'

interface TimelineItem {
  title: string
  desc: string
  time: string
  status: 'resolved' | 'in-progress' | 'note' | 'created'
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

export default function IncidentDetailPage() {
  const { id } = useParams()
  const incidentId = typeof id === 'string' ? id : ''
  const { incidents: rtIncidents } = useRealtime()

  const [loading, setLoading] = useState(true)
  const [incident, setIncident] = useState<IncidentData | null>(null)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [newNote, setNewNote] = useState('')
  const [showNoteModal, setShowNoteModal] = useState(false)

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

  const handleResolve = async () => {
    if (!incident) return
    try {
      await fetch(`/api/wms/incidents/${incident.id}/resolve`, { method: 'POST' })
    } catch {}
    const updated = { ...incident, status: 'RESOLVED' }
    setIncident(updated)
    setTimeline(prev => [
      { title: 'Incident Resolved', desc: 'Resolved by Administrator. Telemetry sensor registers normal states.', time: 'Just Now', status: 'resolved' },
      ...prev
    ])
  }

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNote.trim()) return
    setTimeline(prev => [
      { title: 'Operator Note', desc: newNote, time: 'Just Now', status: 'note' },
      ...prev
    ])
    setNewNote('')
    setShowNoteModal(false)
  }

  if (loading) {
    return <LoadingSpinner text="Retrieving incident timeline registries..." />
  }

  if (!incident) {
    return (
      <div className="p-6 font-sans">
        <Link href="/admin/incidents" className="text-blue-600 hover:underline flex items-center gap-1.5 text-sm mb-4 font-bold">
          <ArrowLeft size={16} /> Back to Incidents
        </Link>
        <EmptyState title="Incident Not Found" description="The requested incident could not be found." icon={ShieldAlert} />
      </div>
    )
  }

  return (
    <div className="space-y-6 font-sans text-sm">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <Link href="/admin/incidents" className="text-blue-600 hover:underline flex items-center gap-1.5 text-sm mb-2 font-bold">
            <ArrowLeft size={16} /> Back to Incidents
          </Link>
          <PageHeader
            title={`Incident Details — #${incident.id}`}
            subtitle={`${incident.terminal} • Reported: ${incident.timestamp}`}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className={cn(
            "px-3 py-1 text-xs font-bold rounded-full border tracking-wide uppercase",
            statusColor(incident.severity)
          )}>
            {incident.severity}
          </span>
          {incident.status !== 'RESOLVED' ? (
            <button
              onClick={handleResolve}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all text-xs active:scale-[0.98] cursor-pointer shadow-sm"
            >
              <CheckCircle2 size={14} />
              <span>Resolve Incident</span>
            </button>
          ) : (
            <span className="px-4 py-2 bg-green-50 border border-green-200 text-green-700 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm">
              <CheckCircle2 size={14} />
              RESOLVED
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-6">
          <DataCard
            title="Telemetry Diagnostic Details"
            subtitle="Parameters captured during the issue trigger."
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-500 mb-1 font-bold uppercase tracking-wider">Facility Score</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xl font-bold font-mono text-slate-900">45%</span>
                  <span className="text-red-650 text-xs font-bold uppercase tracking-wide">Critical</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-500 mb-1 font-bold uppercase tracking-wider">Trigger Event</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-semibold text-slate-700 truncate max-w-[130px]">{incident.title}</span>
                  <AlertCircle size={16} className="text-amber-500 shrink-0" />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-500 mb-1 font-bold uppercase tracking-wider">Consumables</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs font-bold text-green-700">Adequate</span>
                  <span className="text-emerald-650 text-xs font-mono font-bold">92%</span>
                </div>
              </div>
            </div>
          </DataCard>

          {/* Activity Timeline */}
          <DataCard
            title="Activity Timeline"
            subtitle="Audit history logs linked to this incident."
            actions={
              <button
                onClick={() => setShowNoteModal(true)}
                className="text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 text-xs cursor-pointer border-none bg-transparent"
              >
                <MessageSquare size={14} />
                <span>Add Note</span>
              </button>
            }
          >
            <div className="relative space-y-8 before:content-[''] before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200">
              {timeline.map((event, index) => {
                let iconColor = 'bg-slate-100 text-slate-500 border-slate-200'
                if (event.status === 'resolved') {
                  iconColor = 'bg-green-50 text-green-600 border-green-200'
                } else if (event.status === 'in-progress') {
                  iconColor = 'bg-yellow-50 text-yellow-600 border-yellow-250'
                } else if (event.status === 'note') {
                  iconColor = 'bg-blue-50 text-blue-600 border-blue-200'
                }

                return (
                  <div key={index} className="relative pl-10">
                    <div className={cn(
                      "absolute left-0 top-0.5 w-8 h-8 rounded-full flex items-center justify-center border shadow-sm shrink-0",
                      iconColor
                    )}>
                      <Clock size={14} />
                    </div>
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 leading-tight">{event.title}</h4>
                        <p className="text-xs text-slate-605 mt-1 leading-relaxed">{event.desc}</p>
                      </div>
                      <span className="text-[10px] text-slate-450 font-bold uppercase font-mono tracking-wider shrink-0">{event.time}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </DataCard>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-4 space-y-6">
          <DataCard title="Incident Metadata">
            <div className="space-y-3.5 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Incident Code</span>
                <span className="font-mono text-slate-900 font-bold">#{incident.id}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Current Status</span>
                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase", statusColor(incident.status))}>
                  {incident.status.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-500">Assigned Tech</span>
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <User size={12} className="text-slate-400" />
                  {incident.assignedTo}
                </span>
              </div>
            </div>
          </DataCard>

          <DataCard title="Actions Dispatch">
            <div className="space-y-3">
              <button
                onClick={() => alert('Crew alerted')}
                className="w-full bg-white hover:bg-slate-50 text-slate-700 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border border-slate-300 hover:border-slate-400 transition-all active:scale-[0.98] cursor-pointer"
              >
                Dispatch Alert to Crew
              </button>
            </div>
          </DataCard>
        </div>
      </div>

      {/* Note Creation Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <form onSubmit={handleAddNote} className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Add Timeline Entry</h3>
            <textarea
              required
              className="w-full bg-white border border-slate-300 rounded-xl p-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm text-slate-900 h-24 placeholder:text-slate-400"
              placeholder="Enter note or status update detail..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowNoteModal(false)}
                className="px-4 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 text-xs font-semibold rounded-lg cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow-sm cursor-pointer"
              >
                Save Note
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

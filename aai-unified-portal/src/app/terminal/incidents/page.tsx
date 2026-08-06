'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X, AlertTriangle, Clock, CheckCircle,
  RefreshCw, Eye, ChevronDown, Filter, Search, Shield, Check } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { severityBadgeClass, statusBadgeClass, formatTimestamp } from '@/lib/utils'
import type { Incident } from '@/types'
import { useRealtime } from '@/hooks/useRealtime'

interface DAIncident {
  device_id: string
  terminal: string
  level: string
  type: string
  incident_type: string
  severity: string
  description: string
  value: number
  threshold: number
  timestamp: string
  whi: number
}

function adaptDAIncident(inc: DAIncident, idx: number): Incident {
  return {
    id: inc.device_id,
    title: inc.description || inc.incident_type,
    severity: inc.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
    status: 'OPEN',
    terminal: inc.terminal,
    assignedTo: 'Unassigned',
    timestamp: inc.timestamp,
    description: `${inc.device_id} — ${inc.incident_type}: ${inc.value?.toFixed(2)} (threshold: ${inc.threshold})`,
  } as Incident
}

function NewIncidentModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: (incident: Incident) => void
}) {
  const [form, setForm] = useState({
    title:       '',
    description: '',
    severity:    'MEDIUM',
    terminalId:  '',
    location:    '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('Incident title is required')
      return
    }
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/terminal/incidents', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Failed to create incident')
      }

      onSuccess(json.data)
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Report New Incident</h2>
            <p className="text-sm text-slate-500 mt-0.5">Fill in the details to log a new incident report</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-550 shrink-0" />
              <p className="text-red-650 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Incident Title <span className="text-red-550">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Ammonia Level Critical — T1 Gents"
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Provide additional details about the incident..."
              rows={3}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Severity <span className="text-red-550">*</span>
              </label>
              <select
                value={form.severity}
                onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              >
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Terminal</label>
              <select
                value={form.terminalId}
                onChange={e => setForm(p => ({ ...p, terminalId: e.target.value }))}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              >
                <option value="">Select terminal</option>
                <option value="T1">Terminal 1</option>
                <option value="T2">Terminal 2</option>
                <option value="T3">Terminal 3</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-medium py-2.5 rounded-xl transition-colors text-sm">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
              {submitting ? <><RefreshCw size={15} className="animate-spin" /> Creating...</> : <><Plus size={15} /> Create Incident</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function IncidentDetailModal({
  incident,
  onClose,
  onAcknowledge,
  onResolve,
  actionLoading,
}: {
  incident: Incident
  onClose: () => void
  onAcknowledge: (id: string) => void
  onResolve: (id: string) => void
  actionLoading: string | null
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">Incident Details</h2>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap border ${severityBadgeClass(incident.severity)}`}>
              {incident.severity}
            </span>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Incident ID</p>
            <p className="font-mono text-sm text-slate-700">{incident.id}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Title</p>
            <p className="text-sm font-semibold text-slate-900">{incident.title}</p>
          </div>
          {incident.description && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Description</p>
              <p className="text-sm text-slate-700">{incident.description}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Status</p>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap border ${statusBadgeClass(incident.status)}`}>
                {incident.status.replace('_', ' ')}
              </span>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Terminal</p>
              <p className="text-sm text-slate-700">{incident.terminal}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Reported At</p>
            <p className="font-mono text-sm text-slate-500">
              {formatTimestamp(incident.timestamp || '')}
            </p>
          </div>
          {incident.assignedTo && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Assigned To</p>
              <p className="text-sm text-slate-700">{incident.assignedTo}</p>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2.5 rounded-xl transition-colors text-sm">
            Close
          </button>
          {incident.status !== 'RESOLVED' && (
            <>
              <button
                onClick={() => onAcknowledge(incident.id)}
                disabled={actionLoading === incident.id}
                className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
              >
                {actionLoading === incident.id ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Shield size={14} />
                )}
                Acknowledge
              </button>
              <button
                onClick={() => onResolve(incident.id)}
                disabled={actionLoading === incident.id}
                className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
              >
                {actionLoading === incident.id ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                Resolve
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TerminalIncidentsPage() {
  const [incidents, setIncidents]         = useState<Incident[]>([])
  const [loading, setLoading]             = useState(true)
  const [showNewModal, setShowNewModal]   = useState(false)
  const [selectedIncident, setSelected]  = useState<Incident | null>(null)
  const [filterSeverity, setFilterSev]   = useState('ALL')
  const [filterStatus, setFilterStatus]  = useState('ALL')
  const [search, setSearch]              = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError]     = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { incidents: realtimeIncidents } = useRealtime()

  const fetchIncidents = useCallback(async () => {
    try {
      const res  = await fetch('/api/da/incidents', { cache: 'no-store' })
      const json = await res.json()
      const data = Array.isArray(json) ? json : []
      setIncidents(data.map((inc: DAIncident, idx: number) => adaptDAIncident(inc, idx)))
    } catch (err) {
      console.error('Failed to fetch incidents from DA Engine', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchIncidents()
    intervalRef.current = setInterval(fetchIncidents, 30000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchIncidents])

  useEffect(() => {
    if (realtimeIncidents.length > 0) {
      const mapped = realtimeIncidents.map((inc: any, idx: number) =>
        adaptDAIncident({
          device_id: inc.device_id || inc.washroom_id || 'unknown',
          terminal: inc.terminal || '',
          level: '',
          type: '',
          incident_type: inc.incident_type || inc.severity || 'incident',
          severity: inc.severity || 'HIGH',
          description: inc.description || '',
          value: 0,
          threshold: 0,
          timestamp: inc.timestamp || new Date().toISOString(),
          whi: inc.whi || 0,
        }, idx)
      )
      setIncidents(prev => {
        if (prev.length === 0) return mapped
        const existing = new Set(prev.map(p => `${p.terminal}-${p.title}`))
        const newOnly = mapped.filter(m => !existing.has(`${m.terminal}-${m.title}`))
        return [...newOnly, ...prev].slice(0, 50)
      })
    }
  }, [realtimeIncidents])

  function handleNewIncident(incident: Incident) {
    setIncidents(prev => [incident, ...prev])
  }

  async function handleAcknowledge(washroomId: string) {
    setActionLoading(washroomId)
    setActionError(null)
    try {
      const res = await fetch(`/api/wms/incidents/${washroomId}/acknowledge`, {
        method: 'POST',
      })
      if (res.ok) {
        await fetchIncidents()
        setSelected(null)
      } else {
        const data = await res.json()
        setActionError(data.error || 'Failed to acknowledge incident')
      }
    } catch {
      setActionError('Network error — is the WMS Backend running?')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleResolve(washroomId: string) {
    setActionLoading(washroomId)
    setActionError(null)
    try {
      const res = await fetch(`/api/wms/incidents/${washroomId}/resolve`, {
        method: 'POST',
      })
      if (res.ok) {
        await fetchIncidents()
        setSelected(null)
      } else {
        const data = await res.json()
        setActionError(data.error || 'Failed to resolve incident')
      }
    } catch {
      setActionError('Network error — is the WMS Backend running?')
    } finally {
      setActionLoading(null)
    }
  }

  const filtered = incidents.filter(i => {
    if (filterSeverity !== 'ALL' && i.severity !== filterSeverity) return false
    if (filterStatus   !== 'ALL' && i.status   !== filterStatus)   return false
    if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const openCount     = incidents.filter(i => i.status === 'OPEN').length
  const criticalCount = incidents.filter(i => i.severity === 'CRITICAL').length
  const inProgressCount = incidents.filter(i => i.status === 'IN_PROGRESS').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incident Queue"
        subtitle={`${openCount} open · ${criticalCount} critical · ${inProgressCount} in progress`}
        actions={
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm text-sm border-none cursor-pointer"
          >
            <Plus size={16} />
            New Report
          </button>
        }
      />

      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search incidents..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
          />
        </div>
        <select value={filterSeverity} onChange={e => setFilterSev(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-400 cursor-pointer">
          <option value="ALL">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-400 cursor-pointer">
          <option value="ALL">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <button
          onClick={fetchIncidents}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors border-none bg-transparent cursor-pointer"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-550 shrink-0" />
          <p className="text-red-650 text-sm">{actionError}</p>
          <button onClick={() => setActionError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <RefreshCw size={24} className="animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col items-center justify-center h-48 gap-3">
          <CheckCircle size={36} className="text-slate-300" />
          <p className="text-slate-500 font-medium">No incidents found</p>
          <p className="text-slate-400 text-sm">
            {search ? 'Try different search terms' : 'All clear — no active incidents'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(incident => (
            <div
              key={incident.id}
              className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-mono text-xs text-slate-400">{incident.id}</span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap border ${severityBadgeClass(incident.severity)}`}>
                      {incident.severity}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap border ${statusBadgeClass(incident.status)}`}>
                      {incident.status.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm truncate">{incident.title}</h3>
                  {incident.description && (
                    <p className="text-slate-500 text-xs mt-1 line-clamp-2">{incident.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                    {incident.terminal && <span>Terminal: {incident.terminal}</span>}
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {formatTimestamp(incident.timestamp || '')}
                    </span>
                  </div>
                </div>

                        <div className="flex items-center gap-2 shrink-0">
                  {incident.status !== 'RESOLVED' && (
                    <>
                      <button
                        onClick={() => handleAcknowledge(incident.id)}
                        disabled={actionLoading === incident.id}
                        className="flex items-center gap-1 text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <Shield size={12} />
                        Ack
                      </button>
                      <button
                        onClick={() => handleResolve(incident.id)}
                        disabled={actionLoading === incident.id}
                        className="flex items-center gap-1 text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <Check size={12} />
                        Resolve
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelected(incident)}
                    className="flex items-center gap-1.5 text-blue-600 hover:text-blue-750 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shadow-sm"
                  >
                    <Eye size={13} />
                    Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewModal && (
        <NewIncidentModal
          onClose={() => setShowNewModal(false)}
          onSuccess={handleNewIncident}
        />
      )}

      {selectedIncident && (
        <IncidentDetailModal
          incident={selectedIncident}
          onClose={() => setSelected(null)}
          onAcknowledge={handleAcknowledge}
          onResolve={handleResolve}
          actionLoading={actionLoading}
        />
      )}
    </div>
  )
}

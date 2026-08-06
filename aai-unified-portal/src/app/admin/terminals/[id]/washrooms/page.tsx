'use client'

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { statusColor, cn } from '@/lib/utils'
import { Bath, Search, ArrowLeft } from 'lucide-react'
import { useRealtime } from '@/hooks/useRealtime'
import Link from 'next/link'

interface DAWh {
  device_id: string
  type: string
  whi: number
  status: string
  sensors: {
    nh3: number
    h2s: number
    temperature: number
    humidity: number
    occupancy_inside: number
    throughput: number
  }
  penalties: {
    nh3: number
    h2s: number
    humidity: number
    temperature: number
  }
}

function AdminWashroomsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams()
  const terminalId = typeof params.id === 'string' ? params.id : 'T1'
  const levelParam = searchParams.get('level')
  const [selectedLevel, setSelectedLevel] = useState<number>(levelParam ? parseInt(levelParam) : 1)
  const [washrooms, setWashrooms] = useState<DAWh[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { telemetry } = useRealtime()

  const fetchData = useCallback(async () => {
    if (!terminalId || !selectedLevel) return
    try {
      const res = await fetch(`/api/da/levels/${terminalId}/L${selectedLevel}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setWashrooms(data.washrooms || [])
        setError(false)
      } else {
        setError(true)
      }
    } catch (err) {
      console.error('Error fetching washrooms from DA Engine:', err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [terminalId, selectedLevel])

  useEffect(() => {
    setLoading(true)
    fetchData()
    intervalRef.current = setInterval(fetchData, 30000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchData])

  useEffect(() => {
    if (telemetry.length > 0 && washrooms.length > 0) {
      setWashrooms(prev => prev.map(w => {
        const rt = telemetry.find(t => t.device_id === w.device_id)
        if (rt) {
          return { ...w, whi: rt.whi_score, status: rt.whi_score >= 80 ? 'Good' : rt.whi_score >= 60 ? 'Fair' : 'Critical' }
        }
        return w
      }))
    }
  }, [telemetry])

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  if (loading) {
    return <LoadingSpinner text="Querying terminal washroom nodes..." />
  }

  if (error || !washrooms) {
    return (
      <div className="text-sm text-red-655 bg-red-50 border border-red-200 rounded-xl p-4 font-sans">
        Failed to load washroom nodes for Terminal {terminalId} Level {selectedLevel}.
      </div>
    )
  }

  const handleRowClick = (deviceId: string) => {
    router.push(`/terminal/washrooms/total-detail?device_id=${deviceId}`)
  }

  const filteredWashrooms = washrooms.filter((w) => {
    const matchesSearch =
      w.device_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.type.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || w.status.toUpperCase() === statusFilter.toUpperCase()
    return matchesSearch && matchesStatus
  })

  const total = washrooms.length
  const avgWhi = total > 0
    ? Math.round(washrooms.reduce((acc, curr) => acc + curr.whi, 0) / total)
    : 0
  const critical = washrooms.filter(w => w.whi < 60).length
  const cleaning = washrooms.filter(w => w.status === 'Fair').length

  return (
    <div className="space-y-6 font-sans text-sm text-slate-700">
      <div className="flex items-center gap-2">
        <Link href={`/admin/terminals/${terminalId}`} className="text-blue-600 hover:underline flex items-center gap-1.5 text-xs font-bold">
          <ArrowLeft size={16} /> Back to Terminal
        </Link>
      </div>

      <PageHeader
        title={`${terminalId} Washrooms - Level ${selectedLevel}`}
        subtitle="Admin inspection view for washroom facilities."
      />

      <div className="flex gap-2 bg-slate-50 border border-slate-200 p-1 rounded-xl">
        {[1, 2, 3, 4, 5, 6].map((lvl) => (
          <button
            key={lvl}
            onClick={() => setSelectedLevel(lvl)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedLevel === lvl
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            Level {lvl}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Units</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl text-slate-900 font-bold font-mono">{String(total).padStart(2, '0')}</h3>
            <span className="text-xs text-slate-550 font-medium">Active Nodes</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Average WHI</p>
          <div className="flex items-end justify-between">
            <h3 className={cn(
              "text-3xl font-bold font-mono",
              avgWhi < 60 ? 'text-red-655' : avgWhi < 80 ? 'text-amber-600' : 'text-green-600'
            )}>{avgWhi}%</h3>
            <span className="text-xs text-slate-550 font-medium">Level Average</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-red-500">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Critical Units</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl text-red-655 font-bold font-mono">{String(critical).padStart(2, '0')}</h3>
            <span className="text-xs text-red-650 font-bold uppercase tracking-wider animate-pulse">Action Alert</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">In Cleaning</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl text-blue-600 font-bold font-mono">{String(cleaning).padStart(2, '0')}</h3>
            <span className="text-xs text-slate-550 font-medium">Active Shifts</span>
          </div>
        </div>
      </div>

      <DataCard
        title="Washroom Facilities Overview"
        subtitle={`Admin inspection across ${terminalId} - Level ${selectedLevel}.`}
        actions={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search unit by ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-white border border-slate-350 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder:text-slate-400 w-60 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-350 rounded-xl px-3 py-2 text-xs text-slate-805 cursor-pointer focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
            >
              <option value="ALL">All Statuses</option>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
        }
      >
        {filteredWashrooms.length === 0 ? (
          <EmptyState title="No Washrooms Match Filters" description="Adjust filters or check telemetry connectivity." icon={Bath} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                <tr>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Device ID</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">WHI Score</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">NH3 (ppm)</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {filteredWashrooms.map((w) => {
                  const whi = Math.round(w.whi)
                  const healthColorClass =
                    whi < 60 ? 'text-red-655' : whi < 80 ? 'text-amber-600' : 'text-green-600'
                  const healthBarClass =
                    whi < 60 ? 'bg-red-500' : whi < 80 ? 'bg-amber-500' : 'bg-green-500'

                  return (
                    <tr
                      key={w.device_id}
                      onClick={() => handleRowClick(w.device_id)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 font-mono font-bold text-slate-900">{w.device_id}</td>
                      <td className="px-6 py-4 text-xs font-semibold uppercase text-slate-500">{w.type}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div className={cn("h-full", healthBarClass)} style={{ width: `${whi}%` }} />
                          </div>
                          <span className={cn("text-xs font-bold font-mono", healthColorClass)}>{whi}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-550 font-mono">{w.sensors.nh3.toFixed(1)}</td>
                      <td className="px-6 py-4">
                        <span className={cn("px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border", statusColor(w.status))}>
                          {w.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-blue-600 group-hover:translate-x-1 transition-all inline-block font-extrabold">&rarr;</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>
    </div>
  )
}

export default function AdminWashroomsPage() {
  return (
    <Suspense fallback={<LoadingSpinner text="Loading washroom data..." />}>
      <AdminWashroomsContent />
    </Suspense>
  )
}

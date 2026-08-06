'use client'

import React, { useState, useEffect, useRef } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { statusColor } from '@/lib/utils'
import { Cpu, Search } from 'lucide-react'
import { useRealtime } from '@/hooks/useRealtime'

interface DeviceRow {
  id: string
  type: string
  location: string
  battery: number
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE'
  lastPing: string
}

export default function AdminDevicesPage() {
  const [loading, setLoading] = useState(true)
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { devices: rtDevices } = useRealtime()

  useEffect(() => {
    if (rtDevices && rtDevices.length > 0) {
      setDevices((prev: DeviceRow[]) => {
        const rtRows: DeviceRow[] = rtDevices.map((d: any) => ({
          id: d.device_id,
          type: d.type || 'PPM',
          location: `Terminal ${d.terminal} - ${d.level}`,
          battery: d.battery_pct ?? 100,
          status: (d.status === 'MAINTENANCE' ? 'MAINTENANCE' : d.status === 'OFFLINE' ? 'OFFLINE' : 'ONLINE') as DeviceRow['status'],
          lastPing: d.last_ping ? new Date(d.last_ping).toLocaleTimeString() : new Date().toLocaleTimeString(),
        }))
        if (prev.length === 0) return rtRows
        const merged = [...rtRows, ...prev]
        const deduped = merged.filter((item: DeviceRow, index: number, self: DeviceRow[]) =>
          index === self.findIndex((t: DeviceRow) => t.id === item.id)
        )
        return deduped
      })
    }
  }, [rtDevices])

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/da/summary', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          const rows: DeviceRow[] = (data.washroom_list || []).map((w: any) => ({
            id: w.device_id,
            type: w.type || 'PPM',
            location: `Terminal ${w.terminal} - ${w.level}`,
            battery: w.latest_sensors?.battery_level ?? 100,
            status: (w.status === 'Critical' ? 'MAINTENANCE' : 'ONLINE') as DeviceRow['status'],
            lastPing: w.latest_sensors?.updated_at ? new Date(w.latest_sensors.updated_at).toLocaleTimeString() : new Date().toLocaleTimeString(),
          }))
          setDevices(rows)
        }
      } catch (err) {
        console.error('Error fetching devices from DA Engine:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
    intervalRef.current = setInterval(loadData, 30000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const filteredDevices = devices.filter((d) => {
    const matchesSearch =
      d.id.toLowerCase().includes(search.toLowerCase()) ||
      d.type.toLowerCase().includes(search.toLowerCase()) ||
      d.location.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'ALL' || d.status.toUpperCase() === filter.toUpperCase()
    return matchesSearch && matchesFilter
  })

  if (loading) {
    return <LoadingSpinner text="Retrieving operational IoT networks..." />
  }

  return (
    <div className="space-y-6 font-sans text-sm">
      <PageHeader
        title="Hardware Devices"
        subtitle="IoT Node Registries and Network Status"
        actions={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search devices..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all w-60"
              />
            </div>
            <div className="flex bg-slate-50 border border-slate-200 p-1 rounded-xl">
              {['ALL', 'ONLINE', 'OFFLINE', 'MAINTENANCE'].map((statusOption) => (
                <button
                  key={statusOption}
                  onClick={() => setFilter(statusOption)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer uppercase ${
                    filter === statusOption
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  {statusOption}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <DataCard title="Hardware Inventory" subtitle="IoT network nodes online across all facility zones.">
        {filteredDevices.length === 0 ? (
          <EmptyState title="No Hardware Matches" description="Try adjusting your filters or search keywords." icon={Cpu} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                <tr>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Node ID</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Sensor Type</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Location</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Battery Level</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Last Ping</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {filteredDevices.map((dev) => (
                  <tr key={dev.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 font-mono">{dev.id}</td>
                    <td className="px-6 py-4 font-semibold text-slate-800">{dev.type.replace('_', ' ')}</td>
                    <td className="px-6 py-4 text-xs text-slate-550">{dev.location}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-100 border border-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              dev.battery < 20 ? 'bg-red-500' : dev.battery < 50 ? 'bg-amber-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${dev.battery}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-650">{dev.battery}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 font-mono">{dev.lastPing}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${statusColor(dev.status)}`}>
                        {dev.status}
                      </span>
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

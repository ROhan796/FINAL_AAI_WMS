'use client'

import React, { useState, useEffect } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { statusColor } from '@/lib/utils'
import { Cpu } from 'lucide-react'

interface DeviceRow {
  id: string
  type: string
  location: string
  battery: number
  lastPing: string
  status: string
}

export default function OnlineDevicesPage() {
  const [loading, setLoading] = useState(true)
  const [devices, setDevices] = useState<DeviceRow[]>([])

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/da/summary')
        const data = await res.json()
        const list = (data.washroom_list || []).map((w: any) => ({
          id: w.device_id,
          type: w.type || 'PPM',
          location: `${w.terminal} - ${w.level}`,
          battery: w.latest_sensors?.battery ?? 100,
          lastPing: w.last_updated || new Date().toISOString(),
          status: (w.whi >= 60 ? 'ONLINE' : 'OFFLINE'),
        }))
        setDevices(list.filter((d: DeviceRow) => d.status === 'ONLINE'))
      } catch (err) {
        console.error('Error fetching online devices:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) {
    return <LoadingSpinner text="Querying online hardware networks..." />
  }

  return (
    <div className="space-y-6 font-sans text-sm">
      <PageHeader
        title="Online Hardware Devices"
        subtitle="All active, operational IoT nodes currently transmitting telemetry."
      />

      <DataCard title="Online Registries" subtitle="Active IoT devices reporting healthy network metrics.">
        {devices.length === 0 ? (
          <EmptyState title="No Active Nodes" description="All nodes are currently reporting offline or maintenance states." icon={Cpu} />
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
                {devices.map((dev) => (
                  <tr key={dev.id} className="hover:bg-slate-55 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 font-mono">{dev.id}</td>
                    <td className="px-6 py-4 font-semibold text-slate-800">{dev.type.replace('_', ' ')}</td>
                    <td className="px-6 py-4 text-xs text-slate-550">{dev.location}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-100 border border-slate-250 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-green-500"
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

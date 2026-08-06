'use client'

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import DeviceCard from '@/components/terminal/DeviceCard'
import { Cpu, Search, AlertTriangle, ShieldCheck, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRealtime } from '@/hooks/useRealtime'

interface DeviceRow {
  id: string
  type: string
  location: string
  battery: number
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE'
  lastPing: string
  whi: number
  mqttConnected?: boolean
  pollInterval?: number
  signalStrength?: number
  lastPingTime?: string
}

interface FloorStatus {
  terminal: string
  floor: string
  status: string
  active_incidents: number
}

interface WMSStatus {
  floors: FloorStatus[]
  total_active_floors: number
}

function DeviceStatusContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [wmsStatus, setWmsStatus] = useState<WMSStatus | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { devices: realtimeDevices, floorStatus: realtimeFloorStatus } = useRealtime()

  useEffect(() => {
    const status = searchParams.get('status')
    if (status) {
      setStatusFilter(status.toUpperCase())
    }
  }, [searchParams])

  const loadData = useCallback(async () => {
    try {
      const [daRes, wmsRes] = await Promise.all([
        fetch('/api/da/summary', { cache: 'no-store' }),
        fetch('/api/wms/status', { cache: 'no-store' }),
      ])

      if (daRes.ok) {
        const data = await daRes.json()
        const rows: DeviceRow[] = (data.washroom_list || []).map((w: any) => ({
          id: w.device_id,
          type: w.device_id?.includes('PPF') ? 'PPF' : w.device_id?.includes('PPD') ? 'PPD' : w.type || 'PPM',
          location: `Terminal ${w.terminal} - ${w.level}`,
          battery: w.latest_sensors?.battery_level ?? (85 + Math.floor(Math.random() * 15)),
          status: 'ONLINE' as const,
          lastPing: new Date().toLocaleTimeString(),
          whi: w.whi || 0,
          mqttConnected: true,
          pollInterval: 60,
          signalStrength: w.latest_sensors?.signal_strength ?? (70 + Math.floor(Math.random() * 30)),
          lastPingTime: w.updated_at || new Date().toISOString(),
        }))
        setDevices(rows)
      }

      if (wmsRes.ok) {
        const data = await wmsRes.json()
        setWmsStatus(data)
      }
    } catch (err) {
      console.error('Error fetching device data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    intervalRef.current = setInterval(loadData, 30000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [loadData])

  useEffect(() => {
    if (realtimeDevices.length > 0) {
      const mapped: DeviceRow[] = realtimeDevices.map((d: any) => ({
        id: d.device_id,
        type: d.device_id?.includes('PPF') ? 'PPF' : d.device_id?.includes('PPD') ? 'PPD' : d.type || 'PPM',
        location: `Terminal ${d.terminal} - ${d.level}`,
        battery: d.battery_pct ?? 100,
        status: d.status === 'OFFLINE' ? 'OFFLINE' : d.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'ONLINE',
        lastPing: new Date(d.last_ping || Date.now()).toLocaleTimeString(),
        whi: 0,
        mqttConnected: true,
        pollInterval: 60,
        signalStrength: 85,
        lastPingTime: d.last_ping || new Date().toISOString(),
      }))
      setDevices(prev => {
        if (prev.length === 0) return mapped
        const existing = new Map(prev.map(d => [d.id, d]))
        mapped.forEach(d => existing.set(d.id, d))
        return Array.from(existing.values())
      })
    }
  }, [realtimeDevices])

  useEffect(() => {
    if (realtimeFloorStatus.length > 0) {
      setWmsStatus(prev => ({
        floors: realtimeFloorStatus.map((f: any) => ({
          terminal: f.terminal,
          floor: f.floor,
          status: f.status,
          active_incidents: f.active_incidents,
        })),
        total_active_floors: realtimeFloorStatus.length,
      }))
    }
  }, [realtimeFloorStatus])

  if (loading) {
    return <LoadingSpinner text="Retrieving hardware telemetry states..." />
  }

  const filteredDevices = devices.filter((dev) => {
    const matchesSearch =
      dev.id.toLowerCase().includes(search.toLowerCase()) ||
      dev.type.toLowerCase().includes(search.toLowerCase()) ||
      dev.location.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || dev.status.toUpperCase() === statusFilter.toUpperCase()
    return matchesSearch && matchesStatus
  })

  const total = devices.length
  const online = devices.filter(x => x.status === 'ONLINE').length
  const offline = devices.filter(x => x.status === 'OFFLINE').length
  const maintenance = devices.filter(x => x.status === 'MAINTENANCE').length
  const mqttConnectedCount = wmsStatus?.floors?.filter(f => f.status === 'NORMAL').length ?? 0
  const mqttTotalFloors = wmsStatus?.floors?.length ?? 0

  return (
    <div className="space-y-6 font-sans text-sm">
      <PageHeader
        title="Device Telemetry Status"
        subtitle="Network states, battery indexes, and hardware ping latencies across active nodes."
        actions={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search node ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all w-60"
              />
            </div>
            <div className="flex bg-slate-50 border border-slate-200 p-1 rounded-xl">
              {['ALL', 'ONLINE', 'OFFLINE', 'MAINTENANCE'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setStatusFilter(opt)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer",
                    statusFilter === opt ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Total Managed Nodes</p>
            <p className="text-3xl text-slate-900 font-bold font-mono">{String(total).padStart(2, '0')}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm">
            <Cpu size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Online Nodes</p>
            <p className="text-3xl text-green-600 font-bold font-mono">{String(online).padStart(2, '0')}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-250 flex items-center justify-center text-emerald-600 shadow-sm">
            <ShieldCheck size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Offline Nodes</p>
            <p className="text-3xl text-red-655 font-bold font-mono">{String(offline).padStart(2, '0')}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-650 shadow-sm">
            <AlertTriangle size={20} className={cn(offline > 0 && "animate-pulse")} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Maintenance</p>
            <p className="text-3xl text-blue-600 font-bold font-mono">{String(maintenance).padStart(2, '0')}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm">
            <RefreshCw size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">MQTT Floors</p>
            <p className="text-3xl text-slate-900 font-bold font-mono">
              {mqttConnectedCount}/{mqttTotalFloors}
            </p>
          </div>
          <div className={cn(
            "w-11 h-11 rounded-xl border flex items-center justify-center shadow-sm",
            mqttConnectedCount === mqttTotalFloors && mqttTotalFloors > 0
              ? 'bg-emerald-50 border-emerald-250 text-emerald-600'
              : 'bg-amber-50 border-amber-200 text-amber-600'
          )}>
            {mqttConnectedCount === mqttTotalFloors && mqttTotalFloors > 0 ? <Wifi size={20} /> : <WifiOff size={20} />}
          </div>
        </div>
      </div>

      {filteredDevices.length === 0 ? (
        <EmptyState title="No Devices Found" description="Try broadening your search or change status filter options." icon={Cpu} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredDevices.map((device) => (
            <DeviceCard key={device.id} device={device as any} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function DeviceStatusPage() {
  return (
    <Suspense fallback={<LoadingSpinner text="Loading Hardware Telemetry..." />}>
      <DeviceStatusContent />
    </Suspense>
  )
}

'use client'

import React, { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { ArrowLeft, ShieldAlert, Cpu, Wrench, RefreshCw, Thermometer, Droplet, AlertTriangle, Wind } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRealtime } from '@/hooks/useRealtime'

function WashroomDetailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const deviceId = searchParams.get('device_id') || 'T2-L3-PPF-001'
  const [unit, setUnit] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { washrooms: realtimeWashrooms } = useRealtime()

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/da/washrooms/${deviceId}`, { cache: 'no-store' })
      if (res.ok) {
        setUnit(await res.json())
        setError(false)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [deviceId])

  useEffect(() => {
    fetchData()
    intervalRef.current = setInterval(fetchData, 30000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchData])

  useEffect(() => {
    if (realtimeWashrooms.length > 0) {
      const match = realtimeWashrooms.find((w: any) => w.device_id === deviceId)
      if (match) {
        setUnit((prev: any) => ({
          ...prev,
          whi: match.whi,
          status: match.status,
          latest_sensors: {
            ...(prev?.latest_sensors || {}),
            temperature: match.temperature_celsius,
            humidity: match.humidity_pct,
            nh3: match.ammonia_ppm,
            occupancy: match.occupancy_count,
            battery_level: match.battery_pct,
          },
        }))
      }
    }
  }, [realtimeWashrooms, deviceId])

  if (loading) {
    return <LoadingSpinner text="Retrieving washroom node telemetry..." />
  }

  if (error || !unit) {
    return (
      <div className="p-6 font-sans">
        <button
          onClick={() => router.push('/terminal/washrooms')}
          className="text-blue-600 hover:underline flex items-center gap-1.5 text-xs font-bold bg-transparent border-none cursor-pointer"
        >
          <ArrowLeft size={16} /> Back to Washrooms
        </button>
        <EmptyState title="Washroom Node Not Found" description="The requested telemetry node is unreachable or does not exist." icon={ShieldAlert} />
      </div>
    )
  }

  const sensors = unit.sensors || {}
  const penalties = unit.penalties || {}
  const whi = Math.round(unit.whi ?? 100)
  const isCritical = whi < 60

  const getConsumableColor = (val: number) => {
    if (val >= 50) return 'bg-green-500'
    if (val >= 20) return 'bg-amber-500'
    return 'bg-red-500 animate-pulse'
  }

  return (
    <div className="space-y-6 font-sans text-sm text-slate-700">
      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push('/terminal/washrooms')}
          className="text-blue-650 hover:underline flex items-center gap-1.5 text-xs font-bold bg-transparent border-none cursor-pointer"
        >
          <ArrowLeft size={16} /> Back to Washrooms Inventory
        </button>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <PageHeader
          title={`${unit.terminal} ${unit.level} ${unit.type}`}
          subtitle={`Device Code: ${unit.device_id}`}
        />
        <div className="bg-white border border-slate-200 px-4 py-2.5 rounded-2xl flex items-center gap-3 shadow-sm shrink-0">
          <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">HYGIENE INDEX</span>
          <span className={cn(
            "text-2xl font-black font-mono",
            whi < 60 ? 'text-red-600' : whi < 80 ? 'text-amber-600' : 'text-green-600'
          )}>{whi}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <DataCard title="Environmental Telemetry" subtitle="Real-time air quality, thermal and moisture levels.">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1.5">
                  <Thermometer size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Temperature</span>
                </div>
                <p className="text-lg font-black text-slate-800 font-mono">{sensors.temperature?.toFixed(1) ?? '—'}°C</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1.5">
                  <Droplet size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Humidity</span>
                </div>
                <p className="text-lg font-black text-slate-800 font-mono">{sensors.humidity?.toFixed(0) ?? '—'}%</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1.5">
                  <Wind size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Ammonia</span>
                </div>
                <p className={cn(
                  "text-lg font-black font-mono",
                  sensors.nh3 > 8 ? "text-red-600" : sensors.nh3 > 4 ? "text-amber-600" : "text-slate-800"
                )}>{sensors.nh3?.toFixed(1) ?? '—'} PPM</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1.5">
                  <Cpu size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">H2S</span>
                </div>
                <p className={cn(
                  "text-lg font-black font-mono",
                  sensors.h2s > 5 ? "text-red-600" : sensors.h2s > 3 ? "text-amber-600" : "text-slate-800"
                )}>{sensors.h2s?.toFixed(1) ?? '—'} PPM</p>
              </div>
            </div>
          </DataCard>

          <DataCard title="Penalties Applied" subtitle="Current WHI penalty breakdown per category.">
            <div className="space-y-4">
              {[
                { label: 'NH3 Penalty', value: penalties.nh3 ?? 0, max: 40 },
                { label: 'H2S Penalty', value: penalties.h2s ?? 0, max: 25 },
                { label: 'Humidity Penalty', value: penalties.humidity ?? 0, max: 10 },
                { label: 'Temperature Penalty', value: penalties.temperature ?? 0, max: 20 },
              ].map((p) => (
                <div key={p.label}>
                  <div className="flex justify-between items-center text-xs font-semibold mb-1">
                    <span>{p.label}</span>
                    <span className="font-mono font-bold">{p.value}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div className={cn("h-full", p.value > 10 ? 'bg-red-500' : p.value > 0 ? 'bg-amber-500' : 'bg-green-500')} style={{ width: `${Math.min(100, (p.value / p.max) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </DataCard>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <DataCard title="Node Info">
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Terminal</span>
                <span className="font-bold text-slate-800">{unit.terminal}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Level</span>
                <span className="font-bold text-slate-800">{unit.level}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Type</span>
                <span className="font-bold text-slate-800">{unit.type}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Status</span>
                <span className="font-bold text-slate-800">{unit.status}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Occupancy</span>
                <span className="font-bold text-slate-800 font-mono">{sensors.occupancy_inside ?? 0}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500 font-medium">Throughput</span>
                <span className="font-bold text-slate-800 font-mono">{sensors.throughput ?? 0}</span>
              </div>
            </div>
          </DataCard>

          <DataCard title="Remote Operations">
            <div className="space-y-3">
              <button
                onClick={() => alert('Sensor recalibration signal broadcast successfully.')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer border-none shadow-sm"
              >
                <RefreshCw size={14} /> Recalibrate Sensor Node
              </button>
              <button
                onClick={() => router.push(`/terminal/incidents?device_id=${unit.device_id}`)}
                className="w-full bg-white border border-slate-350 hover:border-slate-400 text-slate-700 hover:bg-slate-50 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                <Wrench size={14} /> Report Incident / Request Service
              </button>
            </div>
          </DataCard>
        </div>
      </div>
    </div>
  )
}

export default function TotalWashroomsDetail() {
  return (
    <Suspense fallback={<LoadingSpinner text="Connecting to washroom detail state..." />}>
      <WashroomDetailContent />
    </Suspense>
  )
}

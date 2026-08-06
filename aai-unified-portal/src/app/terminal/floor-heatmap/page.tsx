'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTerminalStore } from '@/lib/store'
import PageHeader from '@/components/ui/PageHeader'
import DataCard from '@/components/ui/DataCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { Building2, MapPin, AlertTriangle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRealtime } from '@/hooks/useRealtime'

export default function FloorHeatmap() {
  const router = useRouter()
  const { selectedTerminal } = useTerminalStore()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<any>(null)
  const [activeLevel, setActiveLevel] = useState<'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6'>('L1')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { washrooms: realtimeWashrooms } = useRealtime()

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/da/summary', { cache: 'no-store' })
      if (res.ok) setSummary(await res.json())
    } catch (err) {
      console.error('Error loading terminal heatmap metrics:', err)
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
    if (realtimeWashrooms.length > 0) {
      setSummary((prev: any) => {
        const existing = prev?.washroom_list || []
        // Use Map for proper deduplication by device_id
        const mergedMap = new Map<string, any>()
        
        // Add existing items
        existing.forEach((w: any) => mergedMap.set(w.device_id, w))
        
        // Update with realtime data or add new entries
        realtimeWashrooms.forEach((rt: any) => {
          const existing = mergedMap.get(rt.device_id)
          if (existing) {
            // Update existing entry with realtime data
            mergedMap.set(rt.device_id, {
              ...existing,
              whi: rt.whi,
              latest_sensors: {
                ...existing.latest_sensors,
                occupancy: rt.occupancy_count,
                temperature: rt.temperature_celsius,
                humidity: rt.humidity_pct,
                nh3: rt.ammonia_ppm,
              },
            })
          } else {
            // Add new entry
            mergedMap.set(rt.device_id, rt)
          }
        })
        
        return { ...prev, washroom_list: Array.from(mergedMap.values()) }
      })
    }
  }, [realtimeWashrooms])

  if (loading) {
    return <LoadingSpinner text="Querying terminal node zones..." />
  }

  const terminal = selectedTerminal || 'T1'
  const allWashrooms = (summary?.washroom_list || [])
    .filter((w: any) => w.terminal === terminal)
    .filter((w: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.device_id === w.device_id) === i)
  const levelWashrooms = allWashrooms.filter((w: any) => w.level === activeLevel)
  const maleUnits = levelWashrooms.filter((w: any) => w.type === 'PPD' || w.type === 'PPM')
  const femaleUnits = levelWashrooms.filter((w: any) => w.type === 'PPF')

  const avgWhi = levelWashrooms.length > 0
    ? Math.round(levelWashrooms.reduce((acc: number, curr: any) => acc + curr.whi, 0) / levelWashrooms.length)
    : 0

  const getWhiTextColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-amber-600'
    return 'text-red-650'
  }

  const getWhiBarColor = (score: number) => {
    if (score >= 80) return 'bg-green-500'
    if (score >= 60) return 'bg-amber-500'
    return 'bg-red-500'
  }

  const getWhiStatus = (score: number): string => {
    if (score >= 80) return 'Good'
    if (score >= 60) return 'Warning'
    return 'Critical'
  }

  const getTrafficStatus = (occupancy: number): string => {
    if (occupancy === 0) return 'Low'
    if (occupancy <= 2) return 'Moderate'
    if (occupancy <= 4) return 'High'
    return 'Peak'
  }

  return (
    <div className="space-y-6 font-sans text-sm text-slate-700">
      <PageHeader
        title="Floor Heatmap"
        subtitle="Live density, usage velocity, and hygiene assessments mapped by gate cluster."
        actions={
          <div className="flex bg-slate-50 border border-slate-200 p-1 rounded-xl">
            {(['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setActiveLevel(lvl)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer uppercase ${
                  activeLevel === lvl
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-550 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <DataCard
            title="Interactive Zone Map"
            subtitle={`Diagnostic overlay displaying live metrics across ${terminal} - ${activeLevel}.`}
          >
            <div className="border border-slate-200 bg-slate-50 p-6 rounded-2xl relative shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="col-span-1 flex flex-col items-center justify-center border-r border-slate-200 pr-4">
                  <span className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">Gents Units</span>
                  <span className="text-blue-600 text-4xl font-extrabold font-mono">{maleUnits.length}</span>
                </div>

                <div className="col-span-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                  {maleUnits.map((w: any) => {
                    const occ = w.latest_sensors?.occupancy ?? 0
                    return (
                      <div
                        key={w.device_id}
                        onClick={() => router.push(`/terminal/washrooms/total-detail?device_id=${w.device_id}`)}
                        className="bg-white p-4 rounded-xl border border-slate-205 hover:border-slate-350 hover:shadow-sm transition-all cursor-pointer relative"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-slate-500 font-mono">{w.type}</span>
                          <span className={cn("text-lg font-bold leading-none font-mono", getWhiTextColor(w.whi))}>
                            {Math.round(w.whi)}
                          </span>
                        </div>
                        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div className={cn("h-full", getWhiBarColor(w.whi))} style={{ width: `${w.whi}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[9px] text-slate-400 font-medium">
                            {getWhiStatus(w.whi)}
                          </span>
                          <span className="text-[9px] text-slate-400 font-medium">
                            Occ: {occ}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="col-span-1 md:col-span-5 h-[1px] bg-slate-200 my-2" />

                <div className="col-span-1 flex flex-col items-center justify-center border-r border-slate-200 pr-4">
                  <span className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">Ladies Units</span>
                  <span className="text-violet-650 text-4xl font-extrabold font-mono">{femaleUnits.length}</span>
                </div>

                <div className="col-span-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                  {femaleUnits.map((w: any) => {
                    const occ = w.latest_sensors?.occupancy ?? 0
                    return (
                      <div
                        key={w.device_id}
                        onClick={() => router.push(`/terminal/washrooms/total-detail?device_id=${w.device_id}`)}
                        className="bg-white p-4 rounded-xl border border-slate-205 hover:border-slate-350 hover:shadow-sm transition-all cursor-pointer relative"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-slate-500 font-mono">{w.type}</span>
                          <span className={cn("text-lg font-bold leading-none font-mono", getWhiTextColor(w.whi))}>
                            {Math.round(w.whi)}
                          </span>
                        </div>
                        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div className={cn("h-full", getWhiBarColor(w.whi))} style={{ width: `${w.whi}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[9px] text-slate-400 font-medium">
                            {getWhiStatus(w.whi)}
                          </span>
                          <span className="text-[9px] text-slate-400 font-medium">
                            Occ: {occ}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </DataCard>

          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="text-xl font-semibold text-slate-800">Concourse Floor Heatmap</h3>
              <p className="text-sm text-slate-500 mt-1">{terminal} — Live Traffic Density</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
              {levelWashrooms.map((w: any) => {
                const whi = Math.round(w.whi)
                const occ = w.latest_sensors?.occupancy ?? 0
                const bgClass = whi < 60 ? 'bg-red-50 border-red-200' : whi < 80 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
                const trafficStatus = getTrafficStatus(occ)
                return (
                  <div
                    key={w.device_id}
                    onClick={() => router.push(`/terminal/washrooms/total-detail?device_id=${w.device_id}`)}
                    className={cn("p-4 rounded-xl border relative h-28 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow cursor-pointer", bgClass)}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-semibold text-slate-600 self-start">{w.type}</span>
                      <span className={cn(
                        "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full",
                        trafficStatus === 'Peak' ? 'bg-red-100 text-red-600' :
                        trafficStatus === 'High' ? 'bg-orange-100 text-orange-600' :
                        trafficStatus === 'Moderate' ? 'bg-yellow-100 text-yellow-600' :
                        'bg-green-100 text-green-600'
                      )}>
                        {trafficStatus}
                      </span>
                    </div>
                    <div className="text-center flex flex-col items-center">
                      <span className="text-xl font-bold font-mono">{whi}%</span>
                      <span className="text-[10px] text-slate-500 font-bold truncate max-w-full">{w.device_id}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-slate-400">Occ: {occ}</span>
                      <span className="text-[9px] text-slate-400">{getWhiStatus(whi)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <DataCard title="Density Diagnostics">
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs font-medium">
                <span className="text-slate-500">Average Level WHI</span>
                <span className="font-mono text-green-600 font-bold text-base">{avgWhi}%</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-slate-500 font-medium">Optimal Nodes</p>
                  <p className="text-lg font-bold text-green-600 mt-1 font-mono">{levelWashrooms.filter((w: any) => w.whi >= 80).length}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-slate-500 font-medium">Critical Nodes</p>
                  <p className="text-lg font-bold text-red-655 mt-1 font-mono">{levelWashrooms.filter((w: any) => w.whi < 60).length}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-slate-500 font-medium">Total Units</p>
                  <p className="text-lg font-bold text-slate-700 mt-1 font-mono">{levelWashrooms.length}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-slate-500 font-medium">Warning Nodes</p>
                  <p className="text-lg font-bold text-amber-600 mt-1 font-mono">{levelWashrooms.filter((w: any) => w.whi >= 60 && w.whi < 80).length}</p>
                </div>
              </div>
            </div>
          </DataCard>

          <DataCard title="Live Alerts Feed">
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {levelWashrooms.filter((w: any) => w.whi < 65).length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400">
                  No critical alerts on this level
                </div>
              ) : (
                levelWashrooms.filter((w: any) => w.whi < 65).map((w: any) => (
                  <div key={w.device_id} className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle size={10} className="text-red-500" />
                        <p className="text-xs font-bold text-slate-900">{w.device_id}</p>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">{w.type} — {w.status || getWhiStatus(w.whi)}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={8} className="text-slate-400" />
                        <span className="text-[8px] text-slate-400">{new Date().toLocaleTimeString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-red-650 font-mono">{Math.round(w.whi)}%</span>
                      <p className="text-[8px] text-red-500 font-bold uppercase mt-0.5">
                        {w.whi < 40 ? 'URGENT' : 'MONITOR'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </DataCard>
        </div>
      </div>
    </div>
  )
}

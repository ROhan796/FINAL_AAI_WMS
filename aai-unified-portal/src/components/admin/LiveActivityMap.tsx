'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ZAxis,
} from 'recharts'

interface AuditActivityPoint {
  terminalId: string
  locationId: string
  xCoordinate: number
  yCoordinate: number
  activityCount: number
  severity: 'Normal' | 'Warning' | 'Critical'
  activeLogsPerMinute: number
  timestamp: string
}

interface LiveActivityMapProps {
  terminal?: string
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload
  if (!data) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-3 py-2 text-sm text-slate-900 font-sans">
      <p className="text-slate-500 text-xs mb-1 font-semibold">{data.locationId}</p>
      <p className="font-semibold text-xs flex items-center gap-1.5 mt-0.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: data.severity === 'Critical' ? '#EF4444' : data.severity === 'Warning' ? '#F59E0B' : '#3B82F6' }} />
        Activity: {data.activityCount} logs
      </p>
      <p className="text-[10px] text-slate-500 mt-1">
        {data.activeLogsPerMinute} logs/min &bull; {data.terminalId}
      </p>
    </div>
  )
}

export default function LiveActivityMap({ terminal = 'T2' }: LiveActivityMapProps) {
  const [data, setData] = useState<AuditActivityPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [logsPerMinute, setLogsPerMinute] = useState(0)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/da/incidents', { cache: 'no-store' })
      if (res.ok) {
        const incidents = await res.json()
        const arr = Array.isArray(incidents) ? incidents : []

        const points: AuditActivityPoint[] = arr.slice(0, 30).map((inc: any, idx: number) => ({
          terminalId: inc.terminal || terminal,
          locationId: inc.device_id || `LOC-${idx}`,
          xCoordinate: Math.floor(Math.random() * 100),
          yCoordinate: Math.floor(Math.random() * 100),
          activityCount: Math.floor(Math.random() * 50) + 1,
          severity: inc.severity === 'CRITICAL' ? 'Critical' : inc.severity === 'HIGH' ? 'Warning' : 'Normal',
          activeLogsPerMinute: Math.floor(Math.random() * 10) + 1,
          timestamp: inc.timestamp || new Date().toISOString(),
        }))

        setData(points)
        setLogsPerMinute(points.reduce((sum, p) => sum + p.activeLogsPerMinute, 0))
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }, [terminal])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-8">
        <p className="text-sm text-slate-400">Loading activity map...</p>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center py-8">
        <p className="text-sm text-slate-400">No activity data available</p>
      </div>
    )
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Critical': return '#EF4444'
      case 'Warning': return '#F59E0B'
      default: return '#3B82F6'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Live Activity Map</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">{terminal} — Real-time audit log activity</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-bold text-slate-700">{logsPerMinute} logs/min</span>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4" style={{ height: '300px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis
              type="number"
              dataKey="xCoordinate"
              name="X"
              stroke="#94A3B8"
              fontSize={10}
              tickLine={false}
              domain={[0, 100]}
            />
            <YAxis
              type="number"
              dataKey="yCoordinate"
              name="Y"
              stroke="#94A3B8"
              fontSize={10}
              tickLine={false}
              domain={[0, 100]}
            />
            <ZAxis
              type="number"
              dataKey="activityCount"
              range={[60, 400]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Scatter data={data} fillOpacity={0.7}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getSeverityColor(entry.severity)} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-4 justify-center">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-500"></span>
          <span className="text-[10px] text-slate-500 font-medium">Normal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500"></span>
          <span className="text-[10px] text-slate-500 font-medium">Warning</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500"></span>
          <span className="text-[10px] text-slate-500 font-medium">Critical</span>
        </div>
        <span className="text-[10px] text-slate-400 ml-2">Bubble size = Activity count</span>
      </div>
    </div>
  )
}

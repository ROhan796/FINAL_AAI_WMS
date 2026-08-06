'use client'

import React from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts'

interface CustomTooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-3 py-2 text-sm text-slate-900 font-sans">
      {label && <p className="text-slate-500 text-xs mb-1 font-semibold">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.payload?.color || '#2563EB' }} className="font-semibold text-xs flex items-center gap-1.5 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color || p.payload?.color || '#2563EB' }} />
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

// 1. Incidents Overview Line Chart (Dashboard) — Smooth line with severity legend
interface DayIncidentCount {
  day: string
  incidents: number
}

export function IncidentsOverviewLineChart({ data = [] }: { data?: DayIncidentCount[] }) {
  if (!data.length) {
    return (
      <div className="w-full font-sans flex items-center justify-center" style={{ height: '280px' }}>
        <p className="text-sm text-slate-400">No incident data available</p>
      </div>
    )
  }

  return (
    <div className="w-full font-sans" style={{ height: '280px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="dashboardIncidentGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
          <XAxis dataKey="day" stroke="#94A3B8" fontSize={10} tickLine={false} interval="preserveStartEnd" />
          <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => Math.round(v).toString()} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="incidents"
            name="Incident Count"
            stroke="#2563EB"
            strokeWidth={2}
            fill="url(#dashboardIncidentGrad)"
            activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
            dot={{ r: 4, fill: '#2563EB' }}
          />
          <Legend wrapperStyle={{ color: '#64748B', fontSize: '12px', marginTop: '10px' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// 2. Washroom Health Donut Chart (Dashboard) — 4-segment: Vacant/Occupied/Cleaning/Out of Order
interface WashroomStatusBucket {
  name: string
  value: number
  color: string
}

export function WashroomHealthDonutChart({ data = [], centerLabel }: { data?: WashroomStatusBucket[]; centerLabel?: string }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)

  if (!data.length || total === 0) {
    return (
      <div className="relative w-full flex items-center justify-center font-sans" style={{ height: '280px' }}>
        <p className="text-sm text-slate-400">No washroom data available</p>
      </div>
    )
  }

  return (
    <div className="relative w-full flex items-center justify-center font-sans" style={{ height: '280px' }}>
      <div className="relative w-48 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={85}
              paddingAngle={4}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none font-sans">
          <span className="text-3xl font-extrabold text-slate-900 leading-none">{total}</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1.5">{centerLabel || 'Washrooms'}</span>
        </div>
      </div>
    </div>
  )
}

// 3. Washroom Health Trends Chart (Analytics) — Current + Target line
interface TrendPoint {
  day: string
  score: number
  target?: number
}

export function WashroomHealthTrendsChart({ data = [], targetScore = 80 }: { data?: TrendPoint[]; targetScore?: number }) {
  if (!data.length) {
    return (
      <div className="w-full font-sans flex items-center justify-center" style={{ height: '280px' }}>
        <p className="text-sm text-slate-400">No trend data available</p>
      </div>
    )
  }

  const enrichedData = data.map(d => ({ ...d, target: d.target ?? targetScore }))

  return (
    <div className="w-full font-sans" style={{ height: '280px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={enrichedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="trendsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#059669" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
          <XAxis dataKey="day" stroke="#94A3B8" fontSize={10} tickLine={false} interval="preserveStartEnd" />
          <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} domain={[50, 100]} tickFormatter={(v) => Math.round(v).toString()} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={targetScore}
            stroke="#94A3B8"
            strokeDasharray="5 5"
            strokeWidth={1.5}
            label={{ value: `Target ${targetScore}`, position: 'right', fontSize: 10, fill: '#94A3B8' }}
          />
          <Area
            type="monotone"
            dataKey="score"
            name="Current WHI"
            stroke="#059669"
            strokeWidth={2}
            fill="url(#trendsGrad)"
            activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
            dot={{ r: 4, fill: '#059669' }}
          />
          <Legend wrapperStyle={{ color: '#64748B', fontSize: '12px', marginTop: '10px' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// 4. Incident Frequency Vertical Bar Chart (Analytics)
interface SeverityCount {
  name: string
  count: number
  color: string
}

export function IncidentFrequencyBarChart({ data = [] }: { data?: SeverityCount[] }) {
  if (!data.length) {
    return (
      <div className="w-full font-sans flex items-center justify-center" style={{ height: '280px' }}>
        <p className="text-sm text-slate-400">No incident data available</p>
      </div>
    )
  }

  return (
    <div className="w-full font-sans" style={{ height: '280px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
          <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} tickLine={false} interval="preserveStartEnd" />
          <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => Math.round(v).toString()} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Incident Count" maxBarSize={48}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
          <Legend wrapperStyle={{ color: '#64748B', fontSize: '12px', marginTop: '10px' }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

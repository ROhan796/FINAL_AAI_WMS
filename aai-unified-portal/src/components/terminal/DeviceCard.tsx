'use client'
import React from 'react'
import { Device } from '../../types'
import { statusColor } from '../../lib/utils'
import {
  Battery, BatteryLow, Wifi, WifiOff, Cpu, Signal,
  Wind, Eye, Thermometer, Droplet, Sparkles, Scroll, Lock
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DeviceWithSignal extends Device {
  signalStrength?: number
  lastPingTime?: string
}

interface Props {
  device: DeviceWithSignal
}

export default function DeviceCard({ device }: Props) {
  const isBatteryLow = device.battery < 20
  const isOnline = device.status === 'ONLINE'
  const signalStrength = device.signalStrength ?? 85

  const getDeviceIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case 'AMMONIA_SENSOR':
        return <Wind size={16} className="text-blue-600" />
      case 'OCCUPANCY_SENSOR':
        return <Eye size={16} className="text-violet-650" />
      case 'TEMP_SENSOR':
        return <Thermometer size={16} className="text-orange-600" />
      case 'WATER_LEAK_DETECTOR':
        return <Droplet size={16} className="text-blue-500" />
      case 'SOAP_DISPENSER_SENSOR':
        return <Sparkles size={16} className="text-emerald-600" />
      case 'PAPER_SENSOR':
        return <Scroll size={16} className="text-amber-600" />
      case 'DOOR_SENSOR':
        return <Lock size={16} className="text-indigo-650" />
      default:
        return <Cpu size={16} className="text-slate-500" />
    }
  }

  const getBatteryColorClass = (bat: number) => {
    if (bat < 20) return 'bg-red-500'
    if (bat < 50) return 'bg-amber-500'
    return 'bg-green-500'
  }

  const getSignalColorClass = (sig: number) => {
    if (sig < 30) return 'text-red-500'
    if (sig < 60) return 'text-amber-500'
    return 'text-green-600'
  }

  const getSignalBars = (sig: number) => {
    const bars = sig < 20 ? 1 : sig < 40 ? 2 : sig < 60 ? 3 : sig < 80 ? 4 : 5
    return bars
  }

  return (
    <div className="bg-white border border-slate-205 p-5 rounded-2xl flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow font-sans shadow-sm">
      <div className="flex justify-between items-start gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 shadow-sm flex items-center justify-center">
            {getDeviceIcon(device.type)}
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 leading-tight">{device.id}</h4>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mt-0.5">
              {device.type.replace('_', ' ')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOnline ? (
            <Wifi className="w-4 h-4 text-emerald-650" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-650" />
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 flex items-center gap-1 font-medium">
            {isBatteryLow ? <BatteryLow size={12} className="text-red-500 animate-pulse" /> : <Battery size={12} className="text-slate-450" />}
            Battery
          </span>
          <span className={cn("font-bold font-mono", isBatteryLow ? 'text-red-650' : 'text-slate-700')}>
            {device.battery}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
          <div
            className={cn("h-full rounded-full transition-all duration-300", getBatteryColorClass(device.battery))}
            style={{ width: `${device.battery}%` }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 flex items-center gap-1 font-medium">
            <Signal size={12} className={getSignalColorClass(signalStrength)} />
            Signal
          </span>
          <span className={cn("font-bold font-mono", getSignalColorClass(signalStrength))}>
            {signalStrength}%
          </span>
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all",
                i < getSignalBars(signalStrength)
                  ? signalStrength >= 60 ? 'bg-green-500' : signalStrength >= 30 ? 'bg-amber-500' : 'bg-red-500'
                  : 'bg-slate-100'
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center text-xs pt-2.5 border-t border-slate-100">
        <span className="text-slate-550 font-medium truncate max-w-[150px]">{device.location}</span>
        <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border", statusColor(device.status))}>
          {device.status}
        </span>
      </div>
    </div>
  )
}

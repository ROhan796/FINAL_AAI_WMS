'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// ── Types ──

export interface RealtimeTelemetry {
  device_id: string
  terminal_id: string
  floor_level: string
  whi_score: number
  ammonia_ppm: number
  occupancy_count: number
  temperature_celsius: number
  humidity_pct: number
  battery_pct: number
  signal_rssi: number
  peak_nh3_ppm: number
  throughput: number
  last_updated: string
}

export interface RealtimeIncident {
  device_id?: string
  washroom_id?: string
  terminal: string
  severity?: string
  incident_type?: string
  description?: string
  whi?: number
  old_state?: string
  new_state?: string
  timestamp: string
}

export interface RealtimeSummary {
  avg_whi: number
  total_washrooms: number
  critical_count: number
  warning_count: number
  good_count: number
  online_devices: number
}

export interface RealtimeLiveWHI {
  device_id: string
  terminal: string
  floor: string
  whi: number
  status: string
  occupancy: number
  ammonia_ppm: number
  last_updated: string
}

export interface RealtimeFloorStatus {
  terminal: string
  floor: string
  status: string
  active_incidents: number
}

export interface RealtimeTrend {
  hour: string
  avg_whi: number
  count: number
}

export interface RealtimeWashroom {
  device_id: string
  terminal: string
  level: string
  whi: number
  status: string
  ammonia_ppm: number
  occupancy_count: number
  temperature_celsius: number
  humidity_pct: number
  battery_pct: number
  last_updated: string
}

export interface RealtimeDevice {
  device_id: string
  terminal: string
  level: string
  battery_pct: number
  status: string
  last_ping: string
  type: string
}

export interface RealtimeState {
  connected: boolean
  telemetry: RealtimeTelemetry[]
  incidents: RealtimeIncident[]
  summary: RealtimeSummary | null
  liveWHI: RealtimeLiveWHI[]
  byTerminal: Record<string, { avg_whi: number; critical_count: number }>
  trends: { hourly: RealtimeTrend[]; daily: RealtimeTrend[] }
  washrooms: RealtimeWashroom[]
  devices: RealtimeDevice[]
  floorStatus: RealtimeFloorStatus[]
  lastUpdate: Date | null
}

// ── WebSocket Manager ──

class WebSocketManager {
  private daWs: WebSocket | null = null
  private wmsWs: WebSocket | null = null
  private reconnectTimers: { da: ReturnType<typeof setTimeout> | null; wms: ReturnType<typeof setTimeout> | null } = { da: null, wms: null }
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private listeners: Set<(state: Partial<RealtimeState>) => void> = new Set()
  private state: RealtimeState = {
    connected: false,
    telemetry: [],
    incidents: [],
    summary: null,
    liveWHI: [],
    byTerminal: {},
    trends: { hourly: [], daily: [] },
    washrooms: [],
    devices: [],
    floorStatus: [],
    lastUpdate: null,
  }
  private queryClient: ReturnType<typeof useQueryClient> | null = null

  setQueryClient(qc: ReturnType<typeof useQueryClient>) {
    this.queryClient = qc
  }

  subscribe(listener: (state: Partial<RealtimeState>) => void): () => void {
    this.listeners.add(listener)
    // Send current state immediately
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  private emit(partial: Partial<RealtimeState>) {
    this.state = { ...this.state, ...partial, lastUpdate: new Date() }
    // connected = true only when at least one WebSocket is open
    this.state.connected = this.daWs?.readyState === WebSocket.OPEN || this.wmsWs?.readyState === WebSocket.OPEN
    this.listeners.forEach(fn => fn(this.state))
  }

  private invalidateQueries(type: string) {
    if (!this.queryClient) return
    // Invalidate React Query caches so fallback polling also picks up changes
    if (type === 'telemetry' || type === 'summary') {
      this.queryClient.invalidateQueries({ queryKey: ['da', 'summary'] })
      this.queryClient.invalidateQueries({ queryKey: ['da', 'terminals'] })
    }
    if (type === 'incidents') {
      this.queryClient.invalidateQueries({ queryKey: ['da', 'incidents'] })
    }
    if (type === 'live_whi') {
      this.queryClient.invalidateQueries({ queryKey: ['da', 'live-whi'] })
    }
  }

  connectDAEngine() {
    if (this.daWs && this.daWs.readyState === WebSocket.OPEN) return

    // In production (Vercel), connect directly to DA Engine backend.
    // In development (Docker/local), proxy through the Next.js server.
    const isProduction = process.env.NODE_ENV === 'production'
    let wsUrl: string

    if (isProduction) {
      const daBase = process.env.NEXT_PUBLIC_DA_ENGINE_URL || 'http://localhost:8001'
      const wsProtocol = daBase.startsWith('https') ? 'wss' : 'ws'
      const daHost = daBase.replace(/^https?:\/\//, '')
      wsUrl = `${wsProtocol}://${daHost}/ws`
    } else {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsHost = window.location.host
      wsUrl = `${wsProtocol}//${wsHost}/ws`
    }

    try {
      this.daWs = new WebSocket(wsUrl)

      this.daWs.onopen = () => {
        console.log('[Realtime] DA Engine WebSocket connected')
        this.emit({ connected: true })
        this.startPing()
        // Request full telemetry data after initial connection
        setTimeout(() => {
          if (this.daWs?.readyState === WebSocket.OPEN) {
            this.daWs.send('request_full')
          }
        }, 1000)
      }

      this.daWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          switch (msg.type) {
            case 'telemetry:update':
              // Merge: DA Engine provides bulk telemetry, preserve WMS-only entries
              this.mergeTelemetry(msg.data.devices || [])
              this.invalidateQueries('telemetry')
              break
            case 'incidents:update':
              // Merge: DA Engine provides bulk incidents, preserve WMS-only entries
              this.mergeIncidents(msg.data.incidents || [])
              this.invalidateQueries('incidents')
              break
            case 'summary:update':
              this.emit({ summary: msg.data })
              this.invalidateQueries('summary')
              break
            case 'live_whi:update':
              this.emit({
                liveWHI: msg.data.rankings || [],
                byTerminal: msg.data.by_terminal || {},
              })
              this.invalidateQueries('live_whi')
              break
            case 'trends:update':
              this.emit({ trends: msg.data || { hourly: [], daily: [] } })
              this.invalidateQueries('trends')
              break
            case 'washrooms:update':
              this.emit({ washrooms: msg.data.washrooms || [] })
              this.invalidateQueries('washrooms')
              break
            case 'devices:update':
              this.emit({ devices: msg.data.devices || [] })
              this.invalidateQueries('devices')
              break
            case 'pong':
              break
          }
        } catch (e) {
          console.error('[Realtime] DA Engine parse error:', e)
        }
      }

      this.daWs.onclose = () => {
        console.log('[Realtime] DA Engine WebSocket closed, reconnecting in 3s...')
        this.emit({ connected: false })
        this.scheduleReconnect('da')
      }

      this.daWs.onerror = (err) => {
        console.error('[Realtime] DA Engine WebSocket error:', err)
        this.daWs?.close()
      }
    } catch (e) {
      console.error('[Realtime] DA Engine WebSocket connect failed:', e)
      this.scheduleReconnect('da')
    }
  }

  connectWMSBackend() {
    if (this.wmsWs && this.wmsWs.readyState === WebSocket.OPEN) return

    // In production (Vercel), connect directly to WMS Backend.
    // In development (Docker/local), proxy through the Next.js server.
    const isProduction = process.env.NODE_ENV === 'production'
    let wsUrl: string

    if (isProduction) {
      const wmsBase = process.env.NEXT_PUBLIC_WMS_API_URL || 'https://localhost:443'
      const wsProtocol = wmsBase.startsWith('https') ? 'wss' : 'ws'
      const wmsHost = wmsBase.replace(/^https?:\/\//, '')
      wsUrl = `${wsProtocol}://${wmsHost}/ws`
    } else {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsHost = window.location.host
      wsUrl = `${wsProtocol}//${wsHost}/wms/ws`
    }

    try {
      this.wmsWs = new WebSocket(wsUrl)

      this.wmsWs.onopen = () => {
        console.log('[Realtime] WMS Backend WebSocket connected')
        this.startPing()
      }

      this.wmsWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          switch (msg.type) {
            case 'mqtt:telemetry':
              // Update individual device in telemetry array
              this.handleMQTTTelemetry(msg.data)
              break
            case 'floor_status:update':
              this.emit({ floorStatus: msg.data.floors || [] })
              break
            case 'incident:new':
              this.handleIncidentUpdate(msg.data)
              break
            case 'alert:escalation':
              break
            case 'pong':
              break
          }
        } catch (e) {
          console.error('[Realtime] WMS Backend parse error:', e)
        }
      }

      this.wmsWs.onclose = () => {
        console.log('[Realtime] WMS Backend WebSocket closed, reconnecting in 3s...')
        this.scheduleReconnect('wms')
      }

      this.wmsWs.onerror = (err) => {
        console.error('[Realtime] WMS Backend WebSocket error:', err)
        this.wmsWs?.close()
      }
    } catch (e) {
      console.error('[Realtime] WMS Backend WebSocket connect failed:', e)
      this.scheduleReconnect('wms')
    }
  }

  private handleMQTTTelemetry(data: any) {
    const current = [...this.state.telemetry]
    const idx = current.findIndex(t => t.device_id === data.device_id)
    const updated: RealtimeTelemetry = {
      device_id: data.device_id,
      terminal_id: data.terminal || '',
      floor_level: data.washroom_id || '',
      whi_score: data.raw_whi || 0,
      ammonia_ppm: data.avg_nh3_ppm || 0,
      occupancy_count: data.occupancy_inside || 0,
      temperature_celsius: data.avg_temperature_c || 0,
      humidity_pct: data.avg_humidity_percent || 0,
      battery_pct: 100,
      signal_rssi: 0,
      peak_nh3_ppm: data.peak_nh3_ppm || 0,
      throughput: data.throughput || 0,
      last_updated: data.timestamp || new Date().toISOString(),
    }

    if (idx >= 0) {
      current[idx] = updated
    } else {
      current.push(updated)
    }
    this.emit({ telemetry: current })
    this.invalidateQueries('telemetry')
  }

  private handleIncidentUpdate(data: any) {
    const current = [...this.state.incidents]
    current.unshift({
      washroom_id: data.washroom_id,
      terminal: data.terminal,
      old_state: data.old_state,
      new_state: data.new_state,
      whi: data.whi,
      timestamp: data.timestamp,
      severity: data.new_state === 'ACTIVE_INCIDENT' ? 'CRITICAL' : 'INFO',
      description: `State changed from ${data.old_state} to ${data.new_state}`,
    })
    // Keep last 50 incidents
    if (current.length > 50) current.length = 50
    this.emit({ incidents: current })
    this.invalidateQueries('incidents')
  }

  private mergeTelemetry(daDevices: any[]) {
    // Deduplicate daDevices by device_id
    const uniqueDaDevices = Array.from(
      new Map(daDevices.map(d => [d.device_id, d])).values()
    )
    const current = [...this.state.telemetry]
    const wmsOnly = current.filter(c => !uniqueDaDevices.some(d => d.device_id === c.device_id))
    const merged = uniqueDaDevices.map(d => ({
      device_id: d.device_id,
      terminal_id: d.terminal || d.terminal_id || '',
      floor_level: d.level || d.floor_level || '',
      whi_score: d.whi || d.whi_score || 0,
      ammonia_ppm: d.ammonia_ppm || d.latest_sensors?.nh3 || 0,
      occupancy_count: d.occupancy || d.occupancy_count || d.latest_sensors?.occupancy || 0,
      temperature_celsius: d.temperature_celsius || d.latest_sensors?.temperature || 0,
      humidity_pct: d.humidity_pct || d.latest_sensors?.humidity || 0,
      battery_pct: d.battery_pct || 100,
      signal_rssi: d.signal_rssi || 0,
      peak_nh3_ppm: d.peak_nh3_ppm || 0,
      throughput: d.throughput || 0,
      last_updated: d.last_updated || new Date().toISOString(),
    }))
    this.emit({ telemetry: [...merged, ...wmsOnly] })
  }

  private mergeIncidents(daIncidents: any[]) {
    const current = this.state.incidents
    const wmsOnly = current.filter(c => !daIncidents.some(d => d.device_id === (c.device_id || c.washroom_id) && d.timestamp === c.timestamp))
    const merged = daIncidents.map(d => ({
      device_id: d.device_id,
      terminal: d.terminal,
      severity: d.severity,
      incident_type: d.incident_type,
      description: d.description,
      timestamp: d.timestamp,
      whi: d.whi,
    }))
    const result = [...merged, ...wmsOnly]
    if (result.length > 50) result.length = 50
    this.emit({ incidents: result })
  }

  private scheduleReconnect(type: 'da' | 'wms') {
    if (this.reconnectTimers[type]) clearTimeout(this.reconnectTimers[type])
    this.reconnectTimers[type] = setTimeout(() => {
      this.reconnectTimers[type] = null
      if (type === 'da') this.connectDAEngine()
      else this.connectWMSBackend()
    }, 3000)
  }

  private startPing() {
    if (this.pingInterval) return
    this.pingInterval = setInterval(() => {
      if (this.daWs?.readyState === WebSocket.OPEN) {
        this.daWs.send('ping')
      }
      if (this.wmsWs?.readyState === WebSocket.OPEN) {
        this.wmsWs.send('ping')
      }
    }, 30000)
  }

  disconnect() {
    if (this.reconnectTimers.da) clearTimeout(this.reconnectTimers.da)
    if (this.reconnectTimers.wms) clearTimeout(this.reconnectTimers.wms)
    if (this.pingInterval) clearInterval(this.pingInterval)
    this.reconnectTimers = { da: null, wms: null }
    this.pingInterval = null
    this.daWs?.close()
    this.wmsWs?.close()
    this.daWs = null
    this.wmsWs = null
    this.emit({ connected: false })
  }
}

// ── Singleton ──
let managerInstance: WebSocketManager | null = null

function getManager(): WebSocketManager {
  if (!managerInstance) {
    managerInstance = new WebSocketManager()
  }
  return managerInstance
}

// ── React Hook ──

export function useRealtime() {
  const queryClient = useQueryClient()
  const [state, setState] = useState<RealtimeState>({
    connected: false,
    telemetry: [],
    incidents: [],
    summary: null,
    liveWHI: [],
    byTerminal: {},
    trends: { hourly: [], daily: [] },
    washrooms: [],
    devices: [],
    floorStatus: [],
    lastUpdate: null,
  })
  const managerRef = useRef<WebSocketManager>(null)

  useEffect(() => {
    const manager = getManager()
    manager.setQueryClient(queryClient)
    managerRef.current = manager

    const unsubscribe = manager.subscribe((partial) => {
      setState(prev => ({ ...prev, ...partial }))
    })

    manager.connectDAEngine()
    manager.connectWMSBackend()

    return () => {
      unsubscribe()
    }
  }, [queryClient])

  return state
}

// ── SSE Fallback Hook (for environments where WebSocket is blocked) ──

export function useSSEFallback() {
  const [telemetry, setTelemetry] = useState<RealtimeTelemetry[]>([])
  const [connected, setConnected] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    // Use DA Engine URL directly in production, or proxy through Next.js in development
    const isProduction = process.env.NODE_ENV === 'production'
    let sseUrl: string

    if (isProduction) {
      const daBase = process.env.NEXT_PUBLIC_DA_ENGINE_URL || 'http://localhost:8001'
      sseUrl = `${daBase}/api/sse/telemetry`
    } else {
      sseUrl = `${window.location.protocol}//${window.location.host}/api/da/sse/telemetry`
    }

    const sse = new EventSource(sseUrl)

    sse.onopen = () => setConnected(true)

    sse.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'telemetry:update') {
          setTelemetry(msg.data.devices || [])
          queryClient.invalidateQueries({ queryKey: ['da'] })
        }
      } catch {}
    }

    sse.onerror = () => {
      setConnected(false)
      sse.close()
    }

    return () => sse.close()
  }, [queryClient])

  return { telemetry, connected }
}

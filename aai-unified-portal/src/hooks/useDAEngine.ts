import { useQuery } from '@tanstack/react-query'

export interface DASummary {
  total_washrooms: number
  online_devices: number
  critical_count: number
  warning_count: number
  good_count: number
  avg_whi: number
  airport_whi: number
  washroom_list: any[]
  terminals: any[]
}

export interface DAIncident {
  device_id: string
  terminal: string
  severity: string
  incident_type: string
  description: string
  timestamp: string
  whi: number
  status?: string
}

export interface DATrend {
  terminal: string
  date: string
  avg_whi: number
  min_whi: number
  max_whi: number
}

export interface DALiveWHI {
  device_id: string
  terminal: string
  floor: string
  whi: number
  status: string
  occupancy: number
  ammonia_ppm: number
  last_updated: string
}

export interface DALiveWHIResponse {
  timestamp: string
  rankings: DALiveWHI[]
  by_terminal: Record<string, { avg_whi: number; critical_count: number }>
}

export interface DATerminal {
  terminal: string
  avg_whi: number
  active_incidents: number
  total_washrooms: number
  floors: any[]
}

export interface DAHealth {
  status: string
  uptime_seconds: number
  last_poll_time: string | null
  processed_files_count: number
  seen_files_count: number
  polling_interval_seconds: number
  environment: string
}

async function daFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api/da${path}`, {
    next: { revalidate: 30 },
  })
  if (!res.ok) throw new Error(`DA Engine error: ${res.status} on ${path}`)
  return res.json()
}

export function useDASummary() {
  return useQuery<DASummary>({
    queryKey: ['da', 'summary'],
    queryFn: () => daFetch<DASummary>('/summary'),
    staleTime: 25000,
    refetchInterval: 30000,
  })
}

export function useDAIncidents() {
  return useQuery<DAIncident[]>({
    queryKey: ['da', 'incidents'],
    queryFn: () => daFetch<DAIncident[]>('/incidents'),
    staleTime: 25000,
    refetchInterval: 30000,
  })
}

export function useDATrends(days: number = 7) {
  return useQuery<DATrend[]>({
    queryKey: ['da', 'trends', days],
    queryFn: () => daFetch<DATrend[]>(`/trends?days=${days}`),
    staleTime: 55000,
    refetchInterval: 60000,
  })
}

export function useDALiveWHI() {
  return useQuery<DALiveWHIResponse>({
    queryKey: ['da', 'live-whi'],
    queryFn: () => daFetch<DALiveWHIResponse>('/live-whi'),
    staleTime: 8000,
    refetchInterval: 10000,
  })
}

export function useDATerminals() {
  return useQuery<DATerminal[]>({
    queryKey: ['da', 'terminals'],
    queryFn: () => daFetch<DATerminal[]>('/terminals'),
    staleTime: 25000,
    refetchInterval: 30000,
  })
}

export function useDATerminal(id: string) {
  return useQuery<DATerminal>({
    queryKey: ['da', 'terminals', id],
    queryFn: () => daFetch<DATerminal>(`/terminals/${id}`),
    staleTime: 25000,
    enabled: !!id,
  })
}

export function useDALevels(terminal: string, level: string) {
  return useQuery<any>({
    queryKey: ['da', 'levels', terminal, level],
    queryFn: () => daFetch<any>(`/levels/${terminal}/${level}`),
    staleTime: 25000,
    enabled: !!terminal && !!level,
  })
}

export function useDAWashroom(deviceId: string) {
  return useQuery<any>({
    queryKey: ['da', 'washrooms', deviceId],
    queryFn: () => daFetch<any>(`/washrooms/${deviceId}`),
    staleTime: 25000,
    enabled: !!deviceId,
  })
}

export function useDAHealth() {
  return useQuery<DAHealth>({
    queryKey: ['da', 'health'],
    queryFn: () => daFetch<DAHealth>('/health'),
    staleTime: 30000,
    refetchInterval: 30000,
  })
}

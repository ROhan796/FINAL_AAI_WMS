/**
 * DA Engine API client.
 * DA Engine runs on port 8001 with no auth — CORS restricted to localhost:3000.
 * Used by both server components (SSR) and client components (browser fetch).
 */

const DA_BASE_URL = process.env.NEXT_PUBLIC_DA_ENGINE_URL ?? 'http://localhost:8001';

export interface WashroomSummary {
  id: string;
  name: string;
  floor: string;
  terminal: string;
  whi: number;           // API-sourced WHI [0-100]
  whi_label: 'API-sourced WHI';
  status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'INCIDENT';
  last_updated: string;  // ISO-8601
  occupancy_count?: number;
  ammonia_ppm?: number;
  temperature_celsius?: number;
  humidity_pct?: number;
  battery_pct?: number;
}

export interface FloorSummary {
  floor: string;
  terminal: string;
  status: 'NORMAL' | 'FLOOR_CRITICAL';
  active_incidents: number;
  washrooms: WashroomSummary[];
}

export interface TerminalSummary {
  terminal: string;
  floors: FloorSummary[];
  avg_whi: number;
  active_incidents: number;
}

export interface SystemSummary {
  terminals: TerminalSummary[];
  total_washrooms: number;
  total_active_incidents: number;
  last_poll_time: string;
}

export interface TrendData {
  washroom_id: string;
  timestamps: string[];
  whi_values: number[];
  moving_avg_7: number[];
}

export interface DAHealthResponse {
  status: 'healthy' | 'degraded';
  uptime_seconds: number;
  last_poll_time: string | null;
  processed_files_count: number;
  seen_files_count: number;
  polling_interval_seconds: number;
  environment: string;
}

async function daFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${DA_BASE_URL}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`DA Engine error: ${res.status} on ${path}`);
  return res.json();
}

export const daClient = {
  getSummary: () => daFetch<SystemSummary>('/api/summary'),
  getWashrooms: () => daFetch<WashroomSummary[]>('/api/washrooms'),
  getWashroom: (id: string) => daFetch<WashroomSummary>(`/api/washrooms/${id}`),
  getTrends: () => daFetch<TrendData[]>('/api/trends'),
  getHealth: () => daFetch<DAHealthResponse>('/api/health'),
};

export type Role = 'ADMIN' | 'TERMINAL' | 'AUDITOR'
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
export type IncidentStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE'
export type WashroomStatus = 'VACANT' | 'OCCUPIED' | 'CLEANING' | 'OUT_OF_ORDER'
export type LogSeverity = 'CRITICAL' | 'WARNING' | 'INFO' | 'SUCCESS'

export interface Incident {
  id: string
  title: string
  severity: Severity
  status: IncidentStatus
  terminal: string
  assignedTo: string
  timestamp: string
  description?: string | null
  terminalId?: string | null
  createdAt?: string | Date
  updatedAt?: string | Date
}

export interface Device {
  id: string
  type: string
  location: string
  battery: number
  status: DeviceStatus
  lastPing: string
}

export interface Terminal {
  id: string
  name: string
  location: string
  technician: string
  washroomCount: number
  status: string
}

export interface AppUser {
  id: string
  name: string
  role: Role
  lastLogin: string
  status: string
  email: string
}

export interface AuditLog {
  id: string
  timestamp: string
  action: string
  userId: string
  ip: string
  details: string
  severity: Severity
  user?: string
}

export interface Washroom {
  id: string
  name: string
  status: WashroomStatus
  occupancy: number
  whi: number
  lastCleaned: string
}

export interface Stall {
  id: string
  label: string
  status: WashroomStatus
}

export interface LogEntry {
  id: string
  timestamp: string
  eventType: string
  severity: LogSeverity
  userId: string
  ip: string
  details: string
}

export interface WHIBreakdown {
  cleanliness: number
  odorControl: number
  soapAvailability: number
  paperAvailability: number
}

export interface Sensor {
  id: string
  type: string
  battery: number
  location: string
  status: DeviceStatus
}

export interface HeatmapZone {
  id: string
  label: string
  traffic: number
}

export type TerminalId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'CGO'
export type UnitType = 'PPM' | 'PPF' | 'PPD' | 'STF'
export type OccupancyStatus = 'VACANT' | 'OCCUPIED' | 'CLEANING' | 'OUT_OF_ORDER'
export type DoorStatus = 'OPEN' | 'CLOSED' | 'LOCKED'


export interface Level {
  id: number
  terminal_id: TerminalId
  level_number: number
  label: string
  is_active: boolean
  total_units?: number
  online_units?: number
  avg_whi?: number
}

export interface WashroomUnit {
  id: number
  device_id: string
  terminal_id: TerminalId
  level_id: number
  unit_type: UnitType
  unit_number: number
  label: string
  capacity: number
  location_desc: string | null
  is_active: boolean
}

export interface WashroomState {
  device_id: string
  updated_at: string
  occupancy_status: OccupancyStatus
  occupancy_count: number
  door_status: DoorStatus
  cleanliness_score: number
  soap_pct: number
  paper_pct: number
  sanitizer_pct: number
  ammonia_ppm: number
  co2_ppm: number
  humidity_pct: number
  temp_celsius: number
  battery_level: number
  signal_strength: number
  whi_score: number
  last_cleaned_at: string | null
  last_inspected_at: string | null
}

export interface WashroomWithState extends WashroomUnit {
  state: WashroomState | null
}

export interface IncidentWithContext extends Omit<Incident, 'terminal'> {
  unit: WashroomUnit | null
  terminal: Terminal
  timeline: IncidentTimeline[]
}

export interface IncidentTimeline {
  id: number
  incident_id: number
  actor: string
  action: string
  note: string | null
  happened_at: string
}

export interface NewIncidentInput {
  device_id?: string
  terminal_id: TerminalId
  level_id?: number
  title: string
  description?: string
  issue_type: string
  severity: Severity
  reported_by: string
}

export interface DashboardSummary {
  total_units: number
  online_units: number
  offline_units: number
  avg_whi_system: number
  avg_whi_by_terminal: Record<TerminalId, number>
  open_incidents: number
  critical_incidents: number
  units_by_status: Record<OccupancyStatus, number>
  low_supply_alerts: number
}

export interface IncidentFilters {
  terminal?: TerminalId
  severity?: Severity
  status?: IncidentStatus
  page?: number
  limit?: number
}

export type HealthStatus = 'Good' | 'Warning' | 'Critical'
export type TrafficLevel = 'Low' | 'Moderate' | 'High' | 'Peak'
export type HygieneStatus = 'Optimal' | 'Average' | 'Action Required'
export type TimeRange = 'Live' | '1 Hour' | '24 Hours'

export interface DayIncidentCount {
  day: string
  incidents: number
}

export interface HealthBucket {
  name: string
  value: number
  color: string
}

export interface WashroomStatusDistribution {
  totalWashrooms: number
  vacantCount: number
  occupiedCount: number
  cleaningCount: number
  outOfOrderCount: number
}

export interface TrendPoint {
  day: string
  score: number
  target?: number
}

export interface SeverityCount {
  name: string
  count: number
  color: string
}

export interface ZoneMapPin {
  zoneId: string
  zoneName: string
  washroomId: string
  washroomName: string
  gender: string
  gateNumber: string
  whiScore: number
  status: HealthStatus
  footTraffic: number
  occupancy: number
  timestamp: string
}

export interface FloorWashroomUnit {
  washroomId: string
  terminalId: string
  zone: string
  unitCount: number
  whiScore: number
  status: HealthStatus
  occupancy: number
  lastUpdated: string
  device_id: string
  type: string
}

export interface DensityDiagnostics {
  averageWHI: number
  optimalNodes: number
  criticalNodes: number
}

export interface LiveAlert {
  washroomId: string
  terminal: string
  alertType: 'Critical' | 'Warning'
  whiScore: number
  location: string
  timestamp: string
}

export interface ConcourseHeatmapCell {
  terminalId: string
  zoneId: string
  trafficDensity: number
  trafficChange: number
  status: TrafficLevel
  timestamp: string
  whi: number
  device_id: string
  type: string
}

export interface DeviceStatusData {
  deviceId: string
  deviceType: string
  batteryLevel: number
  deviceStatus: 'Online' | 'Offline' | 'Maintenance'
  location: string
  terminalId: string
  signalStrength?: number
  lastUpdated: string
}

export interface ZonePerformance {
  zoneId: string
  zoneName: string
  whiScore: number
  performanceChange: number
  timeRange: TimeRange
  status: HealthStatus
  timestamp: string
}

export interface HygieneMapCell {
  zoneId: string
  zoneName: string
  whiScore: number
  status: HygieneStatus
  densityLevel: number
  colorCode: string
  terminalId: string
  lastUpdated: string
}

export interface AuditActivityPoint {
  terminalId: string
  locationId: string
  xCoordinate: number
  yCoordinate: number
  activityCount: number
  severity: 'Normal' | 'Warning' | 'Critical'
  activeLogsPerMinute: number
  timestamp: string
}

export interface SystemHealthMetrics {
  databaseSync: number
  apiLatency: number
  storageCapacity: number
  cloudReplication: boolean
  lastUpdated: string
}


import {
  pgTable, text, integer, decimal, boolean,
  timestamp, serial, bigserial, jsonb, index,
  varchar, real, date, unique
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ── DESIGN NOTE ──
// Neon PostgreSQL serves TWO roles:
//   1. PRIMARY: app_users, audit_logs, system_logs, system_settings (auth + app config)
//   2. FALLBACK: terminals, levels, washroom_units, etc. (mirror of DA Engine data)
// The DA Engine is the source of truth for analytics/telemetry data.
// Fallback tables exist only to provide graceful degradation when DA Engine is offline.

// ── FALLBACK TABLES (DA Engine is source of truth) ──
// These tables mirror DA Engine data for graceful degradation when DA Engine is offline.
// They are NOT actively written to — they serve as read-only fallback queries.

export const terminals = pgTable('terminals', {
  id:           varchar('id', { length: 10 }).primaryKey(),   // 'T1' | 'T2' | 'CGO'
  name:         varchar('name', { length: 100 }).notNull(),   // 'Old Domestic Terminal'
  code:         varchar('code', { length: 10 }).notNull(),    // 'T1'
  type:         varchar('type', { length: 20 }).notNull(),    // 'domestic' | 'international' | 'cargo'
  total_levels: integer('total_levels').notNull().default(6),
  is_active:    boolean('is_active').notNull().default(true),
  created_at:   timestamp('created_at').defaultNow().notNull(),
})

export const levels = pgTable('levels', {
  id:          serial('id').primaryKey(),
  terminal_id: varchar('terminal_id', { length: 10 }).notNull()
               .references(() => terminals.id, { onDelete: 'cascade' }),
  level_number: integer('level_number').notNull(),   // 1–6
  label:        varchar('label', { length: 50 }).notNull(), // 'Level 1 — Arrivals'
  is_active:    boolean('is_active').notNull().default(true),
}, (t) => ({ uniq: unique().on(t.terminal_id, t.level_number) }))

export const washroomUnits = pgTable('washroom_units', {
  id:           serial('id').primaryKey(),
  device_id:    varchar('device_id', { length: 30 }).notNull().unique(), // 'T2-L3-PPF-007'
  terminal_id:  varchar('terminal_id', { length: 10 }).notNull()
                .references(() => terminals.id),
  level_id:     integer('level_id').notNull()
                .references(() => levels.id),
  unit_type:    varchar('unit_type', { length: 5 }).notNull(), // PPM|PPF|PPD|STF
  unit_number:  integer('unit_number').notNull(),
  label:        varchar('label', { length: 60 }).notNull(), // 'T2 · L3 · Female · Unit 07'
  capacity:     integer('capacity').notNull(),               // 4|4|2|3
  location_desc:varchar('location_desc', { length: 200 }),  // 'Near Gate 12, Level 3'
  is_active:    boolean('is_active').notNull().default(true),
  installed_at: timestamp('installed_at').defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.terminal_id, t.level_id, t.unit_type, t.unit_number) }))

export const washroomState = pgTable('washroom_state', {
  device_id:         varchar('device_id', { length: 30 }).primaryKey()
                     .references(() => washroomUnits.device_id),
  updated_at:        timestamp('updated_at').notNull(),
  occupancy_status:  varchar('occupancy_status', { length: 20 }).notNull(), // VACANT|OCCUPIED|CLEANING|OUT_OF_ORDER
  occupancy_count:   integer('occupancy_count').notNull().default(0),
  door_status:       varchar('door_status', { length: 10 }).notNull(),     // OPEN|CLOSED|LOCKED
  cleanliness_score: real('cleanliness_score').notNull(),
  soap_pct:          real('soap_pct').notNull(),
  paper_pct:         real('paper_pct').notNull(),
  sanitizer_pct:     real('sanitizer_pct').notNull(),
  ammonia_ppm:       real('ammonia_ppm').notNull(),
  co2_ppm:           real('co2_ppm').notNull(),
  humidity_pct:      real('humidity_pct').notNull(),
  temp_celsius:      real('temp_celsius').notNull(),
  battery_level:     real('battery_level').notNull(),
  signal_strength:   real('signal_strength').notNull(),
  whi_score:         real('whi_score').notNull(),
  last_cleaned_at:   timestamp('last_cleaned_at'),
  last_inspected_at: timestamp('last_inspected_at'),
})

export const maintenanceIssues = pgTable('maintenance_issues', {
  id:          serial('id').primaryKey(),
  device_id:   varchar('device_id', { length: 30 }).notNull()
               .references(() => washroomUnits.device_id),
  issue_text:  varchar('issue_text', { length: 300 }).notNull(),
  reported_at: timestamp('reported_at').defaultNow().notNull(),
  resolved_at: timestamp('resolved_at'),
  is_resolved: boolean('is_resolved').notNull().default(false),
})

export const incidents = pgTable('incidents', {
  id:           serial('id').primaryKey(),
  incident_ref: varchar('incident_ref', { length: 20 }).notNull().unique(), // 'INC-2024-00001'
  device_id:    varchar('device_id', { length: 30 })
                .references(() => washroomUnits.device_id),
  terminal_id:  varchar('terminal_id', { length: 10 }).notNull()
                .references(() => terminals.id),
  level_id:     integer('level_id').references(() => levels.id),
  title:        varchar('title', { length: 200 }).notNull(),
  description:  text('description'),
  issue_type:   varchar('issue_type', { length: 50 }).notNull(),
  severity:     varchar('severity', { length: 10 }).notNull(), // CRITICAL|HIGH|MEDIUM|LOW
  status:       varchar('status', { length: 20 }).notNull().default('OPEN'),
  reported_by:  varchar('reported_by', { length: 100 }),
  assigned_to:  varchar('assigned_to', { length: 100 }),
  created_at:   timestamp('created_at').defaultNow().notNull(),
  updated_at:   timestamp('updated_at').defaultNow().notNull(),
  resolved_at:  timestamp('resolved_at'),
})

export const incidentTimeline = pgTable('incident_timeline', {
  id:          serial('id').primaryKey(),
  incident_id: integer('incident_id').notNull()
               .references(() => incidents.id, { onDelete: 'cascade' }),
  actor:       varchar('actor', { length: 100 }).notNull(),
  action:      varchar('action', { length: 200 }).notNull(),
  note:        text('note'),
  happened_at: timestamp('happened_at').defaultNow().notNull(),
})

export const whiHistory = pgTable('whi_history', {
  id:        serial('id').primaryKey(),
  device_id: varchar('device_id', { length: 30 }).notNull()
             .references(() => washroomUnits.device_id),
  date:      date('date').notNull(),
  avg_whi:   real('avg_whi').notNull(),
  min_whi:   real('min_whi').notNull(),
  max_whi:   real('max_whi').notNull(),
  total_occupancy_count: integer('total_occupancy_count').notNull().default(0),
}, (t) => ({ uniq: unique().on(t.device_id, t.date) }))

// ── PRIMARY TABLES (Auth + App Config) ──

export const appUsers = pgTable('app_users', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  email:     text('email').unique().notNull(),
  role:      text('role').notNull(),
  clerkId:   text('clerk_id').unique(),
  status:    text('status').default('ACTIVE'),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
  clerkIdx: index('app_users_clerk_idx').on(t.clerkId),
  roleIdx:  index('app_users_role_idx').on(t.role),
}))

export const auditLogs = pgTable('audit_logs', {
  id:         bigserial('id', { mode: 'number' }).primaryKey(),
  timestamp:  timestamp('timestamp').defaultNow(),
  action:     text('action').notNull(),
  userId:     text('user_id').references(() => appUsers.id, { onDelete: 'set null' }),
  ipAddress:  text('ip_address'),
  details:    text('details'),
  severity:   text('severity').default('INFO'),
  terminalId: text('terminal_id').references(() => terminals.id, { onDelete: 'set null' }),
  metadata:   jsonb('metadata'),
}, (t) => ({
  timestampIdx: index('audit_logs_timestamp_idx').on(t.timestamp),
  userIdx:      index('audit_logs_user_idx').on(t.userId),
}))

export const systemLogs = pgTable('system_logs', {
  id:        bigserial('id', { mode: 'number' }).primaryKey(),
  timestamp: timestamp('timestamp').defaultNow(),
  eventType: text('event_type').notNull(),
  severity:  text('severity').default('INFO'),
  userId:    text('user_id'),
  ipAddress: text('ip_address'),
  details:   text('details'),
  source:    text('source'),
  metadata:  jsonb('metadata'),
}, (t) => ({
  timestampIdx: index('system_logs_timestamp_idx').on(t.timestamp),
  severityIdx:  index('system_logs_severity_idx').on(t.severity),
  eventIdx:     index('system_logs_event_idx').on(t.eventType),
}))

export const systemSettings = pgTable('system_settings', {
  id:                  serial('id').primaryKey(),
  ammoniaThreshold:    integer('ammonia_threshold').default(50),
  trafficLimitPerHour: integer('traffic_limit_per_hour').default(200),
  whiAlertThreshold:   integer('whi_alert_threshold').default(60),
  pingIntervalSeconds: integer('ping_interval_seconds').default(30),
  emailAlerts:         boolean('email_alerts').default(true),
  smsAlerts:           boolean('sms_alerts').default(false),
  autoEscalation:      boolean('auto_escalation').default(true),
  updatedAt:           timestamp('updated_at').defaultNow(),
  updatedBy:           text('updated_by'),
})

// ── RELATIONS ──

export const terminalsRelations = relations(terminals, ({ many }) => ({
  levels:        many(levels),
  washroomUnits: many(washroomUnits),
  incidents:     many(incidents),
  auditLogs:     many(auditLogs),
}))

export const levelsRelations = relations(levels, ({ one, many }) => ({
  terminal:      one(terminals, { fields: [levels.terminal_id], references: [terminals.id] }),
  washroomUnits: many(washroomUnits),
}))

export const washroomUnitsRelations = relations(washroomUnits, ({ one, many }) => ({
  terminal:          one(terminals, { fields: [washroomUnits.terminal_id], references: [terminals.id] }),
  level:             one(levels, { fields: [washroomUnits.level_id], references: [levels.id] }),
  state:             one(washroomState, { fields: [washroomUnits.device_id], references: [washroomState.device_id] }),
  maintenanceIssues: many(maintenanceIssues),
  incidents:         many(incidents),
  whiHistory:        many(whiHistory),
}))

export const washroomStateRelations = relations(washroomState, ({ one }) => ({
  unit: one(washroomUnits, { fields: [washroomState.device_id], references: [washroomUnits.device_id] }),
}))

export const incidentsRelations = relations(incidents, ({ one, many }) => ({
  terminal: one(terminals, { fields: [incidents.terminal_id], references: [terminals.id] }),
  level:    one(levels, { fields: [incidents.level_id], references: [levels.id] }),
  unit:     one(washroomUnits, { fields: [incidents.device_id], references: [washroomUnits.device_id] }),
  timeline: many(incidentTimeline),
}))

export const incidentTimelineRelations = relations(incidentTimeline, ({ one }) => ({
  incident: one(incidents, { fields: [incidentTimeline.incident_id], references: [incidents.id] }),
}))

export const appUsersRelations = relations(appUsers, ({ many }) => ({
  auditLogs: many(auditLogs),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user:     one(appUsers, { fields: [auditLogs.userId], references: [appUsers.id] }),
  terminal: one(terminals, { fields: [auditLogs.terminalId], references: [terminals.id] }),
}))

export const washrooms = pgTable('washrooms', {
  id:          text('id').primaryKey(),
  terminalId:  text('terminal_id').references(() => terminals.id),
  name:        text('name').notNull(),
  status:      text('status').notNull(),
  occupancy:   integer('occupancy').notNull().default(0),
  whi:         text('whi').notNull(),
  lastCleaned: timestamp('last_cleaned'),
})

export const stalls = pgTable('stalls', {
  id:          text('id').primaryKey(),
  washroomId:  text('washroom_id').references(() => washrooms.id),
  label:       text('label').notNull(),
  status:      text('status').notNull(),
  lastUpdated: timestamp('last_updated'),
})

export const devices = pgTable('devices', {
  id:         text('id').primaryKey(),
  terminalId: text('terminal_id').references(() => terminals.id),
  type:       text('type').notNull(),
  location:   text('location').notNull(),
  battery:    integer('battery').notNull().default(100),
  status:     text('status').notNull(),
  lastPing:   timestamp('last_ping'),
})

export const whiSnapshots = pgTable('whi_snapshots', {
  id:          serial('id').primaryKey(),
  washroomId:  text('washroom_id').references(() => washrooms.id),
  score:       text('score').notNull(),
  cleanliness: text('cleanliness').notNull(),
  odorControl: text('odor_control').notNull(),
  soapAvail:   text('soap_avail').notNull(),
  paperAvail:  text('paper_avail').notNull(),
  recordedAt:  timestamp('recorded_at').defaultNow(),
})

export const heatmapZones = pgTable('heatmap_zones', {
  id:         text('id').primaryKey(),
  terminalId: text('terminal_id').references(() => terminals.id),
  label:      text('label').notNull(),
  traffic:    integer('traffic').notNull().default(0),
  rowPos:     integer('row_pos').notNull(),
  colPos:     integer('col_pos').notNull(),
  updatedAt:  timestamp('updated_at').defaultNow(),
})

export const reports = pgTable('reports', {
  id:          text('id').primaryKey(),
  title:       text('title').notNull(),
  type:        text('type').notNull(),
  generatedBy: text('generated_by').references(() => appUsers.id, { onDelete: 'set null' }),
  terminalId:  text('terminal_id').references(() => terminals.id, { onDelete: 'set null' }),
  summary:     text('summary'),
  data:        jsonb('data'),
  status:      text('status').default('GENERATED'),
  createdAt:   timestamp('created_at').defaultNow(),
}, (t) => ({
  generatedByIdx: index('reports_generated_by_idx').on(t.generatedBy),
  terminalIdx:    index('reports_terminal_idx').on(t.terminalId),
  createdAtIdx:   index('reports_created_at_idx').on(t.createdAt),
}))

export type Report    = typeof reports.$inferSelect
export type NewReport = typeof reports.$inferInsert

export type {
  Role,
  Severity,
  IncidentStatus,
  OccupancyStatus,
  DoorStatus,
  Terminal,
  Level,
  WashroomUnit,
  WashroomState,
  IncidentWithContext,
  IncidentTimeline,
  NewIncidentInput,
  DashboardSummary,
  IncidentFilters
} from '../types'

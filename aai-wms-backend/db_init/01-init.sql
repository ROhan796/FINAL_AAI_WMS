CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create the foundational telemetry table
CREATE TABLE IF NOT EXISTS washroom_telemetry (
    time TIMESTAMPTZ NOT NULL,
    device_id TEXT NOT NULL,
    terminal TEXT,
    washroom_id TEXT,
    avg_nh3_ppm DOUBLE PRECISION,
    peak_nh3_ppm DOUBLE PRECISION,
    avg_temperature_c DOUBLE PRECISION,
    avg_humidity_percent DOUBLE PRECISION,
    throughput INTEGER,
    occupancy_inside INTEGER,
    abandon_rate_percent DOUBLE PRECISION,
    raw_whi DOUBLE PRECISION
);

-- Scalability: Convert to a TimescaleDB hypertable
-- This partitions the data by time automatically, allowing massive scalability 
-- for millions of records per day without performance degradation.
SELECT create_hypertable('washroom_telemetry', 'time', if_not_exists => TRUE);

-- Scalability: Create indexes for fast dashboard querying by location and device
CREATE INDEX IF NOT EXISTS ix_washroom_telemetry_device_id ON washroom_telemetry (device_id, time DESC);
CREATE INDEX IF NOT EXISTS ix_washroom_telemetry_terminal_washroom ON washroom_telemetry (terminal, washroom_id, time DESC);

-- Create incident_events table
CREATE TABLE IF NOT EXISTS incident_events (
    time TIMESTAMPTZ NOT NULL,
    washroom_id TEXT NOT NULL,
    terminal TEXT NOT NULL,
    old_state TEXT NOT NULL,
    new_state TEXT NOT NULL,
    whi DOUBLE PRECISION
);

-- Convert to a TimescaleDB hypertable
SELECT create_hypertable('incident_events', 'time', if_not_exists => TRUE);

-- Create indexes for incident_events
CREATE INDEX IF NOT EXISTS ix_incident_events_washroom_time ON incident_events (washroom_id, time DESC);

-- Create floor_escalation_events table
CREATE TABLE IF NOT EXISTS floor_escalation_events (
    time TIMESTAMPTZ NOT NULL,
    floor TEXT NOT NULL,
    terminal TEXT NOT NULL,
    old_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    active_incident_count INTEGER NOT NULL
);

-- Convert to a TimescaleDB hypertable
SELECT create_hypertable('floor_escalation_events', 'time', if_not_exists => TRUE);

-- Create indexes for floor_escalation_events
CREATE INDEX IF NOT EXISTS ix_floor_escalation_events_floor_time ON floor_escalation_events (floor, time DESC);

-- Create raw_telemetry_audit table
CREATE TABLE IF NOT EXISTS raw_telemetry_audit (
    received_at TIMESTAMPTZ NOT NULL,
    topic TEXT NOT NULL,
    raw_payload TEXT NOT NULL
);

-- Convert to a TimescaleDB hypertable
SELECT create_hypertable('raw_telemetry_audit', 'received_at', if_not_exists => TRUE);

-- Create indexes for raw_telemetry_audit
CREATE INDEX IF NOT EXISTS ix_raw_telemetry_audit_topic_received_at ON raw_telemetry_audit (topic, received_at DESC);

-- Add retention policy
SELECT add_retention_policy('raw_telemetry_audit', INTERVAL '14 days', if_not_exists => TRUE);

-- Retention policies for data lifecycle management
-- Telemetry: keep 90 days of sensor data
SELECT add_retention_policy('washroom_telemetry', INTERVAL '90 days', if_not_exists => TRUE);
-- Incidents: keep 1 year of incident state transitions
SELECT add_retention_policy('incident_events', INTERVAL '1 year', if_not_exists => TRUE);
-- Floor escalations: keep 1 year
SELECT add_retention_policy('floor_escalation_events', INTERVAL '1 year', if_not_exists => TRUE);

-- Continuous aggregate: hourly WHI summaries per device (pre-computed for fast trend queries)
CREATE MATERIALIZED VIEW IF NOT EXISTS whi_hourly_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    device_id,
    terminal,
    washroom_id,
    AVG(raw_whi) AS avg_whi,
    MIN(raw_whi) AS min_whi,
    MAX(raw_whi) AS max_whi,
    AVG(avg_nh3_ppm) AS avg_nh3,
    AVG(avg_temperature_c) AS avg_temp,
    AVG(avg_humidity_percent) AS avg_humidity,
    SUM(occupancy_inside) AS total_occupancy,
    COUNT(*) AS reading_count
FROM washroom_telemetry
GROUP BY bucket, device_id, terminal, washroom_id
WITH NO DATA;

-- Refresh policy: refresh continuous aggregate every 5 minutes
SELECT add_continuous_aggregate_policy('whi_hourly_summary',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes',
    if_not_exists => TRUE
);

-- Retention on the continuous aggregate: keep 1 year
SELECT add_retention_policy('whi_hourly_summary', INTERVAL '1 year', if_not_exists => TRUE);

-- Continuous aggregate: daily WHI summaries per terminal (for dashboard trends)
CREATE MATERIALIZED VIEW IF NOT EXISTS whi_daily_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    terminal,
    AVG(raw_whi) AS avg_whi,
    MIN(raw_whi) AS min_whi,
    MAX(raw_whi) AS max_whi,
    COUNT(DISTINCT device_id) AS active_devices,
    SUM(throughput) AS total_throughput
FROM washroom_telemetry
GROUP BY bucket, terminal
WITH NO DATA;

-- Refresh policy for daily summary
SELECT add_continuous_aggregate_policy('whi_daily_summary',
    start_offset => INTERVAL '7 days',
    end_offset => INTERVAL '10 minutes',
    schedule_interval => INTERVAL '10 minutes',
    if_not_exists => TRUE
);

-- Retention on daily summary: keep 2 years
SELECT add_retention_policy('whi_daily_summary', INTERVAL '2 years', if_not_exists => TRUE);

-- Create users table for authentication and RBAC
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    zone TEXT DEFAULT NULL,
    shift_start TIME NOT NULL DEFAULT '00:00:00',
    shift_end TIME NOT NULL DEFAULT '23:59:59'
);

-- Trigger function to freeze historical tables
CREATE OR REPLACE FUNCTION freeze_historical_logs()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security Policy Violation: Historical incident audit vectors cannot be altered or removed.';
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to prevent updates and deletions
CREATE OR REPLACE TRIGGER trg_freeze_incident_events
BEFORE UPDATE OR DELETE ON incident_events
FOR EACH ROW EXECUTE FUNCTION freeze_historical_logs();

CREATE OR REPLACE TRIGGER trg_freeze_floor_escalation_events
BEFORE UPDATE OR DELETE ON floor_escalation_events
FOR EACH ROW EXECUTE FUNCTION freeze_historical_logs();

CREATE OR REPLACE TRIGGER trg_freeze_raw_telemetry_audit
BEFORE UPDATE OR DELETE ON raw_telemetry_audit
FOR EACH ROW EXECUTE FUNCTION freeze_historical_logs();




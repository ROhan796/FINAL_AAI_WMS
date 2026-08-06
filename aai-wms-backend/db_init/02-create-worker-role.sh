#!/bin/bash
set -e

# Read the worker password from the mounted docker secret file
WORKER_PASSWORD=$(cat /run/secrets/aai_app_worker_password | tr -d '\r\n')

# Use psql to connect as the superuser to execute role and grant configuration
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create the restricted application role if it does not exist
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aai_app_worker') THEN
            CREATE ROLE aai_app_worker WITH LOGIN PASSWORD '$WORKER_PASSWORD';
        ELSE
            ALTER ROLE aai_app_worker WITH PASSWORD '$WORKER_PASSWORD';
        END IF;
    END \$\$;

    -- Grant schema-level permissions
    GRANT USAGE ON SCHEMA public TO aai_app_worker;

    -- Grant specific table-level permissions (least-privilege)
    GRANT SELECT, INSERT ON TABLE users TO aai_app_worker;
    GRANT SELECT, INSERT ON TABLE washroom_telemetry TO aai_app_worker;
    GRANT SELECT, INSERT ON TABLE incident_events TO aai_app_worker;
    GRANT SELECT, INSERT ON TABLE floor_escalation_events TO aai_app_worker;
    GRANT SELECT, INSERT ON TABLE raw_telemetry_audit TO aai_app_worker;

    -- Grant permissions for sequences
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aai_app_worker;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO aai_app_worker;
EOSQL

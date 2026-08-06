#!/bin/bash
set -e

# Directory setup
mkdir -p certs/ca certs/emqx certs/haproxy certs/postgres certs/backend certs/devices secrets

# Define configuration directory paths
echo "Generating certificates..."

# 1. Generate Private CA
if [ ! -f certs/ca/ca.key ]; then
  openssl genrsa -out certs/ca/ca.key 4096
  openssl req -new -x509 -days 3650 -key certs/ca/ca.key -out certs/ca/ca.crt \
    -subj "/CN=AAI-WMS-CA/O=AAI/C=IN"
fi

# Copy CA cert where needed
cp certs/ca/ca.crt certs/emqx/
cp certs/ca/ca.crt certs/haproxy/
cp certs/ca/ca.crt certs/postgres/
cp certs/ca/ca.crt certs/backend/

# 2. EMQX server cert
openssl genrsa -out certs/emqx/emqx-server.key 2048
openssl req -new -key certs/emqx/emqx-server.key -out certs/emqx/emqx-server.csr \
  -subj "/CN=emqx.iot-network"

echo "subjectAltName=DNS:emqx1.iot-network,DNS:emqx2.iot-network,DNS:emqx3.iot-network,IP:172.20.1.10,IP:172.20.2.10,IP:127.0.0.1" > certs/emqx/ext.cnf
openssl x509 -req -days 825 -in certs/emqx/emqx-server.csr -CA certs/ca/ca.crt -CAkey certs/ca/ca.key \
  -CAcreateserial -out certs/emqx/emqx-server.crt -extfile certs/emqx/ext.cnf
rm certs/emqx/ext.cnf

# 3. HAProxy API cert (dashboard & API)
openssl genrsa -out certs/haproxy/api.key 2048
openssl req -new -key certs/haproxy/api.key -out certs/haproxy/api.csr \
  -subj "/CN=api.iot-network"

echo "subjectAltName=DNS:haproxy1.iot-network,DNS:haproxy2.iot-network,IP:172.20.1.10,IP:172.20.1.100,IP:172.20.1.101,IP:127.0.0.1" > certs/haproxy/ext.cnf
openssl x509 -req -days 825 -in certs/haproxy/api.csr -CA certs/ca/ca.crt -CAkey certs/ca/ca.key \
  -CAcreateserial -out certs/haproxy/api.crt -extfile certs/haproxy/ext.cnf
rm certs/haproxy/ext.cnf

# Combine key and cert for HAProxy
cat certs/haproxy/api.crt certs/haproxy/api.key > certs/haproxy/api.pem

# 4. Postgres server cert
openssl genrsa -out certs/postgres/postgres.key 2048
openssl req -new -key certs/postgres/postgres.key -out certs/postgres/postgres.csr \
  -subj "/CN=postgres.iot-network"

echo "subjectAltName=DNS:washroom-timescaledb,IP:172.20.3.15,IP:127.0.0.1" > certs/postgres/ext.cnf
openssl x509 -req -days 825 -in certs/postgres/postgres.csr -CA certs/ca/ca.crt -CAkey certs/ca/ca.key \
  -CAcreateserial -out certs/postgres/postgres.crt -extfile certs/postgres/ext.cnf
rm certs/postgres/ext.cnf

# 5. Backend client cert (for FastAPI MQTT client)
openssl genrsa -out certs/backend/client.key 2048
openssl req -new -key certs/backend/client.key -out certs/backend/client.csr \
  -subj "/CN=system-backend-subscriber/O=AAI/C=IN"

openssl x509 -req -days 825 -in certs/backend/client.csr -CA certs/ca/ca.crt -CAkey certs/ca/ca.key \
  -CAcreateserial -out certs/backend/client.crt

# 6. Sample device client cert (e.g. pico-T1-W01)
openssl genrsa -out certs/devices/pico-T1-W01.key 2048
openssl req -new -key certs/devices/pico-T1-W01.key -out certs/devices/pico-T1-W01.csr \
  -subj "/CN=pico-T1-W01/O=AAI-WMS/C=IN"

openssl x509 -req -days 825 -in certs/devices/pico-T1-W01.csr -CA certs/ca/ca.crt -CAkey certs/ca/ca.key \
  -CAcreateserial -out certs/devices/pico-T1-W01.crt

# Set file permissions
chmod 644 certs/ca/ca.crt
chmod 644 certs/emqx/emqx-server.crt certs/emqx/emqx-server.key
chmod 644 certs/haproxy/api.crt certs/haproxy/api.key certs/haproxy/api.pem
chmod 644 certs/postgres/postgres.crt certs/postgres/postgres.key
chmod 644 certs/backend/client.crt certs/backend/client.key
chmod 644 certs/devices/pico-T1-W01.crt certs/devices/pico-T1-W01.key

echo "Generating Docker secrets..."
# Populate secrets if they don't exist
if [ ! -f secrets/postgres_password.txt ]; then
  openssl rand -hex 16 > secrets/postgres_password.txt
fi
if [ ! -f secrets/emqx_dashboard_password.txt ]; then
  openssl rand -hex 16 > secrets/emqx_dashboard_password.txt
fi
if [ ! -f secrets/redis_password.txt ]; then
  openssl rand -hex 16 > secrets/redis_password.txt
fi
if [ ! -f secrets/aai_app_worker_password.txt ]; then
  openssl rand -hex 32 > secrets/aai_app_worker_password.txt
fi
if [ ! -f secrets/jwt_secret_key.txt ]; then
  # Generates 32 bytes (256 bits) of raw entropy formatted as a 64-character hex string
  openssl rand -hex 32 > secrets/jwt_secret_key.txt
fi
if [ ! -f secrets/operator_password.txt ]; then
  # Generates 16 random bytes (128 bits of entropy) formatted in Base64 (24 chars) for user UX
  openssl rand -base64 16 > secrets/operator_password.txt
fi
if [ ! -f secrets/supervisor_password.txt ]; then
  # Generates 16 random bytes (128 bits of entropy) formatted in Base64 (24 chars) for user UX
  openssl rand -base64 16 > secrets/supervisor_password.txt
fi

chmod 600 secrets/*.txt

echo "Setup complete! Secrets and certificates generated successfully."

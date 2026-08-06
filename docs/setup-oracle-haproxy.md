# Setup Guide: HAProxy + Keepalived on Oracle Cloud Free Tier VM

## Prerequisites

- Oracle Cloud Free Tier account (sign up at https://cloud.oracle.com)
- SSH key pair (generate with `ssh-keygen -t ed25519`)
- Docker and Docker Compose installed on both VMs
- GitHub repo cloned locally

## Step 1: Create 2 ARM Instances

1. Log in to Oracle Cloud Console
2. Navigate to Compute → Instances → Create Instance
3. Select the following configuration:
   - **Image**: Ubuntu 22.04 (or latest LTS)
   - **Shape**: VM.Standard.A1.Flex (ARM)
   - **OCPU**: 1 OCPU
   - **RAM**: 6 GB
   - **Networking**: Select your VCN and subnet
4. Upload your SSH public key
5. Repeat for a second instance (same shape)
6. Note the public IP addresses of both VMs

## Step 2: Configure Security Lists

For each VM, configure the following security list rules:

**Ingress Rules:**
| Port | Protocol | Source | Description |
|------|----------|--------|-------------|
| 443 | TCP | 0.0.0.0/0 | HTTPS |
| 8883 | TCP | 0.0.0.0/0 | MQTT over SSL |
| 18083 | TCP | 0.0.0.0/0 | EMQX Dashboard |
| 8001 | TCP | 0.0.0.0/0 | DA Engine |
| 22 | TCP | Your IP | SSH |

**Egress Rules:**
| Port | Protocol | Destination | Description |
|------|----------|-------------|-------------|
| All | All | 0.0.0.0/0 | All outbound traffic |

## Step 3: SSH into Each VM and Install Docker

```bash
# SSH into each VM
ssh -i ~/.ssh/your-key ubuntu@YOUR_VM_IP

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Add current user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Verify installation
docker --version
docker compose version
```

## Step 4: Clone Repo and Copy Files

```bash
# On each VM
cd /opt
sudo mkdir -p aai-wms-backend && cd aai-wms-backend

# Clone repo
git clone https://github.com/your-org/Fullstack_Unification.git .

# Copy cloud-specific files
cp aai-wms-backend/docker-compose.cloud.yml docker-compose.yml
mkdir -p haproxy certs

# Copy HAProxy config
cp aai-wms-backend/haproxy/haproxy-cloud.cfg haproxy/

# Copy certificates
cp -r aai-wms-backend/certs/haproxy/* certs/
```

## Step 5: Update haproxy-cloud.cfg

Edit `haproxy/haproxy-cloud.cfg` on each VM and replace the placeholder URLs with your actual Render service URLs:

```
# Find and replace:
YOUR_RENDER_WMS_URL  → your-wms-backend.onrender.com
YOUR_RENDER_DA_URL   → your-da-engine.onrender.com
```

Example changes in the config file:
- `server fastapi YOUR_RENDER_WMS_URL:443` → `server fastapi your-wms-backend.onrender.com:443`
- `server da-engine YOUR_RENDER_DA_URL:443` → `server da-engine your-da-engine.onrender.com:443`

## Step 6: Set Up .env2 on Each VM

```bash
# Create .env2 file
cat > .env2 << 'EOF'
# ── App ──
APP_ENV=production

# ── TimescaleDB (Cloud — NeonDB) ──
DATABASE_URL=postgresql://neondb_owner:npg_...@ep-.../timescaledb?sslmode=require

# ── Upstash Redis ──
REDIS_URL=rediss://default:...@ready-monkey-212683.upstash.io:6379/0

# ── MQTT (EMQX Cloud) ──
MQTT_HOST=ke1040ef.ala.us-east-1.emqxsl.com
MQTT_PORT=8883
MQTT_USE_TLS=true
MQTT_WS_PORT=8084
MQTT_USER=aai-backend
MQTT_PASSWORD=AaiBackend@2026!
MQTT_CA_CERT_PATH=/etc/haproxy/certs/emqx/ca.crt

# ── EMQX API ──
EMQX_API_ENDPOINT=https://ke1040ef.ala.us-east-1.emqxsl.com:8443/api/v5
EMQX_API_KEY=i0ee1696
EMQX_API_SECRET=XZMMg0S7pJx_8lkA

# ── CORS ──
CORS_ALLOW_ORIGINS=https://your-vercel-app.vercel.app
CORS_ORIGINS=https://your-vercel-app.vercel.app

# ── Backend URLs ──
RAILWAY_BACKEND_URL=https://your-wms-backend.onrender.com
RAILWAY_DA_ENGINE_URL=https://your-da-engine.onrender.com
EOF
```

## Step 7: Run Docker Compose

```bash
# Start services
docker compose -f docker-compose.cloud.yml up -d

# Check status
docker compose -f docker-compose.cloud.yml ps
```

## Step 8: Verify HAProxy Health

```bash
# Check HAProxy logs
docker logs haproxy1

# Verify HAProxy config is valid
docker exec haproxy1 haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg

# Test connectivity
curl -k https://YOUR_VM_IP/health
```

## Keepalived Configuration

### Node 1 (MASTER)
```yaml
# In docker-compose.cloud.yml
keepalived1:
  environment:
    - KEEPALIVED_STATE=MASTER
    - KEEPALIVED_PRIORITY=101
    - KEEPALIVED_ROUTER_ID=51
    - KEEPALIVED_UNICAST_PEERS=#PYTHON2BASH:['NODE2_PRIVATE_IP']
```

### Node 2 (BACKUP)
```yaml
# In docker-compose.cloud.yml
keepalived2:
  environment:
    - KEEPALIVED_STATE=BACKUP
    - KEEPALIVED_PRIORITY=100
    - KEEPALIVED_ROUTER_ID=51
    - KEEPALIVED_UNICAST_PEERS=#PYTHON2BASH:['NODE1_PRIVATE_IP']
```

### Virtual IP (VIP)
- **VIP**: 172.20.1.10
- **Network**: frontend (172.20.1.0/24)

### Important: Keepalived Capabilities

Keepalived containers require the following capabilities:

```yaml
cap_add:
  - NET_ADMIN
  - NET_RAW
  - NET_BROADCAST
```

## Verification

1. Check that HAProxy1 is the MASTER and HAProxy2 is the BACKUP
2. Verify the VIP (172.20.1.10) is assigned to Node 1
3. Test failover by stopping Node 1 and verifying VIP moves to Node 2
4. Test all endpoints (MQTT, API, Dashboard) through the VIP

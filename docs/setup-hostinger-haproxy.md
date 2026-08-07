# Setup Guide: HAProxy on Hostinger VPS

## Overview

Hostinger VPS runs HAProxy as a Docker container on a single Linux VM. You manage the VM directly — install Docker, configure firewall, set up SSL certificates.

| Component | Details |
|---|---|
| Platform | Hostinger VPS (Ubuntu 22.04) |
| Recommended Plan | KVM 2 (2 vCPU, 4GB RAM, ~$6/mo) or KVM 1 (1 vCPU, 4GB RAM, ~$4/mo) |
| HAProxy RAM Usage | ~30MB |
| TLS | Let's Encrypt via certbot |
| Deployment | Docker Compose |

## Architecture

```
                    Hostinger VPS (YOUR_VPS_IP)
                    ┌─────────────────────────┐
                    │  HAProxy Container       │
  MQTT (8883)  ───► │  :8883 → EMQX Cloud     │
  Dashboard   ───► │  :18083 → EMQX Cloud     │
  API HTTPS   ───► │  :443 → Render WMS       │
  DA Engine   ───► │  :8001 → Render DA       │
                    └─────────────────────────┘
```

## Prerequisites

- Hostinger account (https://hostinger.com)
- VPS plan purchased (Ubuntu 22.04)
- Domain name (optional, can use IP directly)
- SSH access (Hostinger provides root access)

## Step 1: Purchase VPS

1. Go to https://hostinger.com/vps-hosting
2. Select **KVM 2** or **KVM 1** plan
3. Choose **Ubuntu 22.04 64-bit** as the OS
4. Complete purchase
5. Note down: **IP address**, **root password** (from hPanel email)

## Step 2: Connect via SSH

```bash
ssh root@YOUR_VPS_IP
```

Enter the root password from your Hostinger email.

## Step 3: Initial Server Setup

```bash
# Update system
apt update && apt upgrade -y

# Set timezone
timedatectl set-timezone UTC

# Create a non-root user (optional but recommended)
adduser haproxy-user
usermod -aG sudo haproxy-user

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose -y

# Enable Docker to start on boot
systemctl enable docker
systemctl start docker

# Verify Docker
docker --version
docker-compose --version
```

## Step 4: Configure Firewall

```bash
# Install UFW
apt install ufw -y

# Allow SSH
ufw allow 22/tcp

# Allow HAProxy ports
ufw allow 8883/tcp    # MQTT over SSL
ufw allow 18083/tcp   # EMQX Dashboard
ufw allow 443/tcp     # HTTPS API
ufw allow 8001/tcp    # DA Engine
ufw allow 80/tcp      # HTTP (for Let's Encrypt verification)

# Enable firewall
ufw enable

# Verify
ufw status
```

## Step 5: Set Up SSL Certificates (Let's Encrypt)

### Option A: Using certbot (recommended)

```bash
# Install certbot
apt install certbot -y

# Get certificate (standalone mode — stops any service on port 80 temporarily)
certbot certonly --standalone -d YOUR_DOMAIN.com --email YOUR_EMAIL --agree-tos --no-eff-email

# Certificates will be at:
# /etc/letsencrypt/live/YOUR_DOMAIN.com/fullchain.pem
# /etc/letsencrypt/live/YOUR_DOMAIN.com/privkey.pem
```

### Option B: Using IP address (no domain)

If you don't have a domain, you can use a self-signed certificate:

```bash
# Create certs directory
mkdir -p /opt/aai-wms-backend/certs/haproxy

# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /opt/aai-wms-backend/certs/haproxy/api.key \
    -out /opt/aai-wms-backend/certs/haproxy/api.pem \
    -subj "/CN=YOUR_VPS_IP"
```

### Copy certificates to HAProxy directory

```bash
# For certbot (Let's Encrypt)
mkdir -p /opt/aai-wms-backend/certs/haproxy
cp /etc/letsencrypt/live/YOUR_DOMAIN.com/fullchain.pem /opt/aai-wms-backend/certs/haproxy/api.pem
cp /etc/letsencrypt/live/YOUR_DOMAIN.com/privkey.pem /opt/aai-wms-backend/certs/haproxy/api.key

# Combine for HAProxy (HAProxy wants a single .pem file with cert + key)
cat /opt/aai-wms-backend/certs/haproxy/api.pem /opt/aai-wms-backend/certs/haproxy/api.key > /opt/aai-wms-backend/certs/haproxy/api.pem

# Set permissions
chmod 600 /opt/aai-wms-backend/certs/haproxy/api.pem
```

## Step 6: Clone the Repository

```bash
cd /opt
git clone https://github.com/YOUR_USERNAME/Fullstack_Unification.git
cd Fullstack_Unification/aai-wms-backend
```

## Step 7: Update haproxy-cloud.cfg

Edit the HAProxy config with your actual Render URLs:

```bash
nano haproxy/haproxy-cloud.cfg
```

Replace:
- `YOUR_RENDER_WMS_URL` → `your-wms-backend.onrender.com`
- `YOUR_RENDER_DA_URL` → `your-da-engine.onrender.com`

## Step 8: Start HAProxy

```bash
docker-compose -f docker-compose.cloud.yml up -d
```

## Step 9: Verify

```bash
# Check container is running
docker ps

# Check logs
docker logs haproxy-cloud

# Test health endpoint
curl http://localhost:8080/health

# Test from external
curl https://YOUR_VPS_IP:443/health
```

## Step 10: Set Up Auto-Renewal (Let's Encrypt)

```bash
# Test renewal
certbot renew --dry-run

# Add cron job for auto-renewal
crontab -e
```

Add this line:

```
0 3 * * * certbot renew --post-hook "docker restart haproxy-cloud" >> /var/log/certbot-renew.log 2>&1
```

## Updating HAProxy

When you change `haproxy-cloud.cfg`:

```bash
cd /opt/Fullstack_Unification/aai-wms-backend

# Pull latest changes
git pull

# Restart HAProxy
docker-compose -f docker-compose.cloud.yml restart

# Or rebuild if Dockerfile changed
docker-compose -f docker-compose.cloud.yml up -d --build
```

## Useful Commands

| Command | Description |
|---|---|
| `docker ps` | List running containers |
| `docker logs haproxy-cloud` | View HAProxy logs |
| `docker restart haproxy-cloud` | Restart HAProxy |
| `docker-compose -f docker-compose.cloud.yml down` | Stop HAProxy |
| `docker-compose -f docker-compose.cloud.yml up -d` | Start HAProxy |
| `docker exec -it haproxy-cloud sh` | Shell into container |
| `ufw status` | Check firewall rules |
| `certbot certificates` | List all certificates |

## Troubleshooting

| Issue | Solution |
|---|---|
| Port 443 already in use | `sudo lsof -i :443` and kill the process |
| Container won't start | Check `docker logs haproxy-cloud` |
| SSL certificate error | Verify cert paths in `haproxy-cloud.cfg` |
| Can't connect externally | Check `ufw status` and Hostinger firewall rules |
| DNS not resolving | Wait for propagation or use IP directly |

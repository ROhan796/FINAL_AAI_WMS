# HAProxy Config Sync — Hostinger VPS

## Single VPS = No Sync Needed

With Hostinger, you run **one VPS with one HAProxy container**. There's no second node to sync to. When you update the config, you just restart the container on the same VPS.

## How to Update HAProxy Config

### Step 1: SSH into the VPS

```bash
ssh root@YOUR_VPS_IP
```

### Step 2: Pull Latest Changes

```bash
cd /opt/Fullstack_Unification
git pull origin main
```

### Step 3: Restart HAProxy

```bash
cd aai-wms-backend
docker-compose -f docker-compose.cloud.yml restart
```

### Step 4: Verify

```bash
docker logs --tail 20 haproxy-cloud
```

## If Dockerfile Changed

```bash
docker-compose -f docker-compose.cloud.yml up -d --build
```

## Rollback

```bash
# Revert to previous config
git revert HEAD
docker-compose -f docker-compose.cloud.yml restart
```

## Automated Deployment (Optional)

Create a deploy script on the VPS:

```bash
cat > /opt/deploy-haproxy.sh << 'EOF'
#!/bin/bash
cd /opt/Fullstack_Unification
git pull origin main
cd aai-wms-backend
docker-compose -f docker-compose.cloud.yml up -d --build
echo "[$(date)] Deployment complete" >> /var/log/haproxy-deploy.log
EOF

chmod +x /opt/deploy-haproxy.sh
```

Then trigger remotely:

```bash
ssh root@YOUR_VPS_IP "/opt/deploy-haproxy.sh"
```

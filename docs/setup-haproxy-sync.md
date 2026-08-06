# Setup Guide: HAProxy Config Sync Between 2 Oracle VMs

## Why Sync?

When you update `haproxy-cloud.cfg` on Node 1, Node 2 needs the same configuration to ensure consistent load balancing behavior across both HAProxy instances. Without sync, the backup node may have outdated configuration.

## Method 1: SSH Key-Based rsync Cron Job (Recommended)

### Step 1: Generate SSH Key Pair on Node 1

```bash
# On Node 1 (MASTER)
ssh-keygen -t ed25519 -f /root/.ssh/haproxy_sync -N ""

# Copy public key to Node 2
ssh-copy-id -i /root/.ssh/haproxy_sync.pub root@NODE2_IP
```

### Step 2: Test SSH Connection

```bash
# From Node 1
ssh -i /root/.ssh/haproxy_sync root@NODE2_IP "echo 'SSH connection successful'"
```

### Step 3: Create Sync Script

```bash
# On Node 1
cat > /opt/scripts/sync-haproxy.sh << 'EOF'
#!/bin/bash
# HAProxy Config Sync Script
# Syncs configuration from Node 1 (MASTER) to Node 2 (BACKUP)

# Configuration
NODE2_IP="YOUR_NODE2_IP"
SSH_KEY="/root/.ssh/haproxy_sync"
CONFIG_DIR="/opt/aai-wms-backend/haproxy"
REMOTE_CONFIG_DIR="/opt/aai-wms-backend/haproxy"

# Sync config
rsync -avz -e "ssh -i ${SSH_KEY}" \
    ${CONFIG_DIR}/haproxy-cloud.cfg \
    root@${NODE2_IP}:${REMOTE_CONFIG_DIR}/haproxy-cloud.cfg

if [ $? -eq 0 ]; then
    echo "[$(date)] Config sync successful"
    
    # Graceful reload HAProxy on Node 2
    ssh -i ${SSH_KEY} root@${NODE2_IP} \
        "docker exec haproxy2 kill -s HUP 1"
    
    if [ $? -eq 0 ]; then
        echo "[$(date)] HAProxy reloaded on Node 2"
    else
        echo "[$(date)] Failed to reload HAProxy on Node 2"
        exit 1
    fi
else
    echo "[$(date)] Config sync failed"
    exit 1
fi
EOF

# Make executable
chmod +x /opt/scripts/sync-haproxy.sh
```

### Step 4: Set Up Cron Job

```bash
# Add cron job (runs every 5 minutes)
echo "*/5 * * * * root /opt/scripts/sync-haproxy.sh >> /var/log/haproxy-sync.log 2>&1" > /etc/cron.d/haproxy-sync

# Set permissions
chmod 644 /etc/cron.d/haproxy-sync

# Verify cron is running
systemctl status cron
```

### Step 5: Test Sync Manually

```bash
# Run sync script
/opt/scripts/sync-haproxy.sh

# Check logs
cat /var/log/haproxy-sync.log

# Verify config on Node 2
ssh -i /root/.ssh/haproxy_sync root@NODE2_IP \
    "cat /opt/aai-wms-backend/haproxy/haproxy-cloud.cfg"
```

### Step 6: Verify HAProxy Reload

After sync, verify HAProxy on Node 2 reloaded successfully:

```bash
# On Node 2
docker logs haproxy2 | tail -20

# Check HAProxy process
docker exec haproxy2 ps aux | grep haproxy
```

## Method 2: Git-Based Sync (Alternative)

If both VMs pull from the same repository, you can use a Git-based approach:

### Step 1: Set Up Pull Script

```bash
# On both VMs
cat > /opt/scripts/pull-haproxy.sh << 'EOF'
#!/bin/bash
# Pull latest HAProxy config from Git

cd /opt/aai-wms-backend
git pull origin main

# Reload HAProxy
docker exec haproxy1 kill -s HUP 1
docker exec haproxy2 kill -s HUP 1
EOF

chmod +x /opt/scripts/pull-haproxy.sh
```

### Step 2: Set Up Cron Job

```bash
# On both VMs
echo "*/5 * * * * root /opt/scripts/pull-haproxy.sh >> /var/log/haproxy-pull.log 2>&1" > /etc/cron.d/haproxy-pull

chmod 644 /etc/cron.d/haproxy-pull
```

### Limitations of Git-Based Approach

- Requires Git access from both VMs
- May have race conditions if both VMs push changes
- Less immediate than rsync

## Important Notes

### Keepalived VIP

The Keepalived Virtual IP (VIP) ensures traffic always hits the active node. Even if sync fails, the VIP will route to whichever node is healthy:

- **VIP**: 172.20.1.10
- **Node 1 (MASTER)**: Priority 101
- **Node 2 (BACKUP)**: Priority 100

### Graceful Reload vs Restart

- **Graceful reload** (`kill -s HUP 1`): Applies new config without dropping connections
- **Restart** (`docker restart`): Drops all connections, use only if reload fails

### Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Sync fails | SSH key not configured | Verify SSH key with `ssh -i /root/.ssh/haproxy_sync root@NODE2_IP` |
| HAProxy not reloading | Container name wrong | Check container name with `docker ps` |
| Cron not running | Permission denied | Check `/var/log/haproxy-sync.log` for errors |
| Config not updated | rsync path wrong | Verify paths in sync script |

### Monitoring

```bash
# Check sync logs
tail -f /var/log/haproxy-sync.log

# Verify config matches on both nodes
diff <(ssh root@NODE1 "cat /opt/aai-wms-backend/haproxy/haproxy-cloud.cfg") \
     <(ssh root@NODE2 "cat /opt/aai-wms-backend/haproxy/haproxy-cloud.cfg")
```

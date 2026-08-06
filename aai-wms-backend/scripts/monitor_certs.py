#!/usr/bin/env python
import os
import sys
import json
from datetime import datetime, timezone, timedelta
from cryptography import x509
from cryptography.hazmat.backends import default_backend

# Output log path (host mount path, fallback to workspace local if not writable)
LOG_DIR = "/var/log/aai-wms/certs"
LOG_FILE = "monitor.log"

def get_log_path():
    try:
        if not os.path.exists(LOG_DIR):
            os.makedirs(LOG_DIR, exist_ok=True)
        path = os.path.join(LOG_DIR, LOG_FILE)
        with open(path, "a") as f:
            pass
        return path
    except Exception:
        # Fallback to local logs directory
        local_dir = "./logs/certs"
        os.makedirs(local_dir, exist_ok=True)
        return os.path.join(local_dir, LOG_FILE)

def check_certificates(certs_dir, threshold_days=30):
    log_path = get_log_path()
    now = datetime.now(timezone.utc)
    threshold = timedelta(days=threshold_days)
    
    print(f"Scanning certificate files in '{certs_dir}' (expiry threshold: {threshold_days} days)...")
    print(f"Logging warnings to: {log_path}\n")
    
    found_any = False
    
    # Walk the directory
    for root, _, files in os.walk(certs_dir):
        for file in files:
            if file.endswith((".crt", ".pem", ".der")):
                cert_path = os.path.join(root, file)
                
                # Exclude key files combined inside PEM (e.g. api.pem contains key, let's load it and check)
                try:
                    with open(cert_path, "rb") as f:
                        cert_data = f.read()
                        
                    # Only parse if it looks like a certificate
                    if b"-----BEGIN CERTIFICATE-----" not in cert_data and not cert_path.endswith(".der"):
                        continue
                        
                    cert = x509.load_pem_x509_certificate(cert_data, default_backend())
                    
                    # Handle datetime timezone difference gracefully
                    try:
                        expiry = cert.not_valid_after_utc
                    except AttributeError:
                        expiry = cert.not_valid_after.replace(tzinfo=timezone.utc)
                        
                    time_remaining = expiry - now
                    days_remaining = time_remaining.days
                    
                    print(f"Cert: {file} | Subject: {cert.subject.rfc4514_string()} | Expires in {days_remaining} days")
                    
                    if time_remaining <= threshold:
                        # Expiring within threshold! Log a JSON warning
                        log_entry = {
                            "timestamp": now.isoformat(),
                            "service": "cert_monitor",
                            "level": "WARNING",
                            "event": f"Certificate {cert_path} is expiring soon (expires in {days_remaining} days on {expiry.isoformat()})",
                            "cert_path": cert_path,
                            "days_remaining": days_remaining,
                            "expiry_date": expiry.isoformat()
                        }
                        
                        # Write to JSON monitor log
                        with open(log_path, "a") as lf:
                            lf.write(json.dumps(log_entry) + "\n")
                            
                        print(f"--> ALERT: Certificate is within {threshold_days}-day expiry window!")
                        found_any = True
                        
                except Exception as e:
                    print(f"Error parsing cert {cert_path}: {e}")
                    
    if not found_any:
        print("\nNo certificates expiring within the warning threshold were found.")

if __name__ == "__main__":
    # Walk relative 'certs' folder
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    certs_folder = os.path.join(base_dir, "certs")
    check_certificates(certs_folder)

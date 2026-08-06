# AAI Intelligent Washroom Monitoring Pipeline
## Certificate and Key Rotation Policy

This document outlines the operational lifetimes, rotation schedules, and warning thresholds for all cryptographic assets used in the AAI WMS deployment.

---

## 1. Asset Rotation Matrix

| Cryptographic Asset | Recommended Lifetime | Rotation Trigger | Warning Threshold | Operational Impact of Expiry |
| :--- | :--- | :--- | :--- | :--- |
| **CA Root Certificate** | 10 years | Calendar schedule (Planned event) | 365 days | **Critical**: Trust chain breaks, all mTLS validation fails. |
| **EMQX Server TLS Cert** | 1 year | 30-day pre-expiry alert | 30 days | **High**: Device connection drops due to TLS verification failure. |
| **Per-Device mTLS Certs** | 1 year | 30-day pre-expiry alert | 30 days | **Medium**: Affected device blocked from publishing telemetry. |
| **JWT Signing Key (RS256/HS256)** | 90 days | Scheduled rotation with overlap window | 15 days | **High**: Operator and supervisor login sessions terminated. |
| **HAProxy TLS Termination Cert** | 1 year | 30-day pre-expiry alert | 30 days | **High**: REST API calls fail, browsers block web dashboard. |

---

## 2. Expiry Monitoring & Cron Integration

The certificate expiry monitoring script runs daily as a cron job to inspect certificate lifetimes and write structured events that Wazuh SIEM can process.

### Cron Installation

Add the following entry to the host server crontab to execute the check daily at midnight:

```cron
0 0 * * * cd <PROJECT_ROOT> && python3 scripts/monitor_certs.py >> /var/log/aai-wms/certs/cron_stdout.log 2>&1
```

*Note: Replace `<PROJECT_ROOT>` with the absolute installation path of the project on the server (e.g. `/opt/aai-wms`).*

---

## 3. JWT Signing Key Rotation (with Overlap Window)

To prevent session termination for active users during key rotation:
1. Maintain two keys in the secrets directory:
   - `/run/secrets/jwt_secret_key` (Active key for signing new tokens)
   - `/run/secrets/jwt_secret_key_previous` (Previous key used for validation overlap)
2. During key rotation:
   - Move `jwt_secret_key` to `jwt_secret_key_previous`.
   - Generate a new key and write it to `jwt_secret_key`.
3. The API accepts both keys for token decoding, allowing users with existing sessions to remain logged in until their 15-minute token expires, while all new logins are signed with the new key.

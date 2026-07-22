---
title: 'Deployment, Monitoring, and Infrastructure Audit'
last_updated: '2026-06-28'
version: '3.2'
category: 'Infrastructure'
priority: 'Medium'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'post-release'
consolidates: 'DEPLOYMENT.md, MONITORING.md'
---

# Deployment Audit Framework

> **Scope**: Runtime observability (health checks, metrics, log rotation, alerting, audit log archival) is reviewed here alongside deployment and infrastructure topics.

> **Cross-Audit Boundary**: CI/CD pipeline quality gates, IaC drift, and promotion strategy live in `DEVOPS.md`. The _contents_ of the image's served directory — what shipped, and the headers and encodings the static origin returns — live in [BUILD_OUTPUT.md](./BUILD_OUTPUT.md). This audit focuses on the deployed process: container, reverse-proxy, and runtime observability.

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Applicability and Scope

This audit is written against apps deployed as the **Spernakit monolithic container** (nginx + supervisord + Bun backend + built frontend). The container, reverse-proxy, TLS, rollback, and backup-volume sections all assume that deployment shape.

For apps that are **not** deployed as the Spernakit container (local-runtime CLI tools, dev-only utilities, or standalone binaries with no `Dockerfile`/`docker-compose.production.yml`), the container/reverse-proxy/TLS/rollback sections are **N/A** and should be scored as such (not as findings). For those apps the audit reduces to:

- **Loopback binding by default** (`127.0.0.1`), with an explicit warning required before binding to a remote interface (`allowRemote` or equivalent).
- **Secret handling** (no plaintext secrets committed or logged).
- **Log rotation** (bounded log growth).
- **Data-directory backup** (the app's data directory is backed up and restorable).

A missing container shape is only a finding for apps that are _intended_ to ship as the Spernakit container. Confirm the deployment target before scoring the container/proxy/TLS sections.

### aidd context (Class B)

aidd is a single-user **local CLI + embedded Elysia control panel + spawned agent subprocesses + SQLite single-writer**, with NO multi-tenant / workspace / container / cloud layer. The container/image, orchestrator, TLS-termination, and multi-node rollback sections are **N/A (by design)** for aidd and should be scored as such rather than as Pass/finding, but only after confirming no degenerate equivalent exists. Marking a SaaS-only control N/A is permitted ONLY after confirming it truly does not exist in aidd; if a degenerate equivalent exists (e.g. the web bearer token in place of RBAC, or the `~/.aidd/` data directory in place of a backup volume), audit that equivalent.

The reverse-proxy posture remains IN SCOPE even for local tools: delegate it to PROXY_AUTH_BOUNDARY.md; do not skip it.

## Executive Summary

**Critical Deployment Priorities**

- **Single-Container Discipline**: Spernakit ships as one monolithic container (nginx + supervisord + Bun backend + built frontend). Deployment audits must verify this shape is intact.
- **TLS Termination Outside the Container**: HTTPS is handled by an external reverse proxy (Caddy / Traefik / nginx-proxy-manager). The container listens on a single HTTP port (default 3330).
- **Runtime Observability**: `healthService`, `metricsService`, pino structured logs, and the `alerting` config section must be wired and exercised.
- **Backup Verification**: Database backups (SQLite file copy, optionally encrypted) must exist, rotate, and be restorable.
- **Rollback Capability**: Image tag pinning + volume isolation means rollback is `docker compose` with a prior image tag; this must be documented and tested.

**Essential Standards (Required)**

- **Container shape**: Single image, single exposed port, `read_only: true`, non-root `bun` user, dropped capabilities.
- **Config**: JSON-only (`config/{appname}.json`). No `.env` files. Secrets injected via environment variables at container start.
- **Health endpoint**: `/api/v1/health` responds 200 from the internal backend; the Docker `HEALTHCHECK` directive hits it through nginx.
- **Logging**: pino JSON logs to rotating files under `/app/logs` (mounted volume).
- **Alerting**: `alerting` config section reviewed; at least one channel (inApp / email / webhook) enabled for production.
- **Backups**: `database.backup.enabled` true in production, retention days set, location mounted.

## Table of Contents

- [Applicability and Scope](#applicability-and-scope)

1. [Pre-Audit Setup](#pre-audit-setup)
2. [Container and Image Standards](#container-and-image-standards)
3. [Configuration and Secrets](#configuration-and-secrets)
4. [Reverse Proxy and TLS](#reverse-proxy-and-tls)
5. [Rollback and Recovery](#rollback-and-recovery)
6. [Health Checks and Liveness](#health-checks-and-liveness)
7. [Metrics and Performance Telemetry](#metrics-and-performance-telemetry)
8. [Structured Logging and Log Rotation](#structured-logging-and-log-rotation)
9. [Alerting and Incident Response](#alerting-and-incident-response)
10. [Audit Log Archival](#audit-log-archival)
11. [Scheduled Task and Process Monitoring](#scheduled-task-and-process-monitoring)
12. [Database Backup Verification](#database-backup-verification)
13. [Resource Utilization](#resource-utilization)
14. [Audit Checklist](#audit-checklist)
15. [Report Template](#report-template)

## Pre-Audit Setup

### Required Access

```bash
# Verify container runtime access
docker ps
docker compose -f docker-compose.production.yml ps

# Verify host / reverse proxy access
sudo systemctl status caddy    # or traefik, nginx
```

### Verification Commands

```bash
# Inspect image and effective entrypoint
docker inspect <image> --format '{{.Config.Entrypoint}} {{.Config.Cmd}}'

# Show the production compose file
cat docker-compose.production.yml

# Confirm config mount and secret envs are injected (not baked into image)
docker inspect <container> --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
docker exec <container> env | grep -E '_(JWT|COOKIE|ENCRYPTION|API)'

# Hit the health endpoint from inside the container
docker exec <container> wget -qO- http://127.0.0.1:3330/api/v1/health
```

## Container and Image Standards

**MANDATORY: Single monolithic container matching the Spernakit reference shape.**

Reference: `<spernakit-root>/Dockerfile`, `<spernakit-root>/docker-compose.production.yml`.

Good: Reference production shape

```yaml
services:
    spernakit:
        image: ghcr.io/nomadicdaddy/${APP_SLUG}:${APP_VERSION:-latest}
        ports:
            - '127.0.0.1:${FRONTEND_PORT:-3330}:${FRONTEND_PORT:-3330}'
        volumes:
            - ${APPDATA_ROOT}/${APP_SLUG}/config:/app/config
            - ${APPDATA_ROOT}/${APP_SLUG}/data:/app/data
            - ${APPDATA_ROOT}/${APP_SLUG}/logs:/app/logs
            - ${BACKUPS_ROOT}/${APP_SLUG}:/app/backups
        restart: unless-stopped
        security_opt:
            - no-new-privileges:true
        cap_drop:
            - ALL
        read_only: true
        tmpfs:
            - /tmp:uid=1000,gid=1000
            - /var/log/nginx:uid=1000,gid=1000
            - /var/log/supervisor:uid=1000,gid=1000
        healthcheck:
            test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1:${FRONTEND_PORT:-3330}/api/v1/health']
            interval: 30s
            timeout: 10s
            retries: 3
            start_period: 45s
        deploy:
            resources:
                limits:
                    memory: 512M
                    cpus: '1.0'
        logging:
            driver: json-file
            options:
                max-file: '5'
                max-size: 10m
```

Bad: Drifted shape (any of the following is a finding)

- Exposing the internal backend port (3331) directly to the host.
- Running as root (missing `USER bun`).
- Writable root filesystem without `read_only: true`.
- Two separate containers (one for frontend, one for backend); this is not the Spernakit model.
- An external database container (Spernakit uses embedded SQLite/libSQL by default).

## Configuration and Secrets

**MANDATORY: JSON config mounted read-only; secrets injected via env only.**

- `config/{appname}.json` lives on the host and is mounted into `/app/config` (read-only recommended).
- No `.env` files anywhere. `bunfig.toml` has `env = false`.
- Per-slug secret envs must be present: `{SLUG_UPPER}_JWT_PRIVATE_KEY`, `_JWT_PUBLIC_KEY`, `_JWT_REFRESH_PRIVATE_KEY`, `_JWT_REFRESH_PUBLIC_KEY`, `_COOKIE_SECRET`, `_ENCRYPTION_KEY`, `_API_KEY`.
- `cookieSecure: true` when behind HTTPS.
- No plaintext secrets in the image, in config files committed to git, or in `docker inspect` output beyond what is already expected.

## Reverse Proxy and TLS

TLS termination is the reverse proxy's job. The container speaks HTTP on its single port.

```
[Client] --HTTPS--> [Caddy / Traefik / nginx-proxy] --HTTP--> [container :3330]
```

Caddy (recommended, auto-TLS):

```caddy
your-domain.com {
    reverse_proxy localhost:3330
}
```

Audit checks:

- Reverse proxy enforces TLS and HSTS.
- The container is not reachable directly from the public internet (bind `127.0.0.1:3330` on the host).
- HTTP→HTTPS redirect is in place.
- Certificates auto-renew (Caddy / Traefik / certbot).

> Application security headers (CSP, HSTS policy correctness) are owned by `SECURITY.md`; this audit verifies only that the proxy terminates TLS and forwards proxy headers correctly.

## Rollback and Recovery

Rollback = pin the previous image tag and restart.

```bash
# Tag discipline: deploy by explicit version, never :latest in production
export APP_VERSION=1.4.2
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d

# Rollback
export APP_VERSION=1.4.1
docker compose -f docker-compose.production.yml up -d

# Verify
curl -fsS http://127.0.0.1:3330/api/v1/health
```

Audit checks:

- Production compose pins `APP_VERSION` to an explicit tag (not `:latest`).
- Previous image tags are retained in the registry (retention policy exists).
- Database migration rollback plan is documented (Spernakit migrations are forward-only; rollback usually means restoring the pre-deploy backup).
- Volume data survives container recreation.

## Health Checks and Liveness

Spernakit exposes `/api/v1/health` via `healthService`. The Docker `HEALTHCHECK` directive calls it through nginx.

```bash
# From host (through reverse proxy, if configured)
curl -fsS https://your-domain.com/api/v1/health

# From host to container (bypasses reverse proxy)
curl -fsS http://127.0.0.1:3330/api/v1/health

# Inside the container (direct to backend)
docker exec <container> wget -qO- http://127.0.0.1:3331/api/v1/health
```

Audit checks:

- `healthCheck.enabled: true` in the effective config.
- `healthCheck.interval`, `retentionDays`, and per-check thresholds (`auth`, `db`, etc.) are present and reasonable.
- `healthService` history is being written (`health_history` table rows are growing).
- Integrity checks (`database.integrityCheck.enabled`) are scheduled.
- Supervisord reports both `nginx` and `backend` processes healthy (`docker exec <container> supervisorctl status`).

## Metrics and Performance Telemetry

Spernakit records runtime metrics via `metricsService` (request latency, error counts, per-route aggregation) and surfaces them on the Metrics admin page.

Audit checks:

- Metrics endpoint (`/api/v1/metrics` or equivalent admin route) returns data.
- Retention window is reasonable relative to disk budget.
- Dashboards in the app render recent data (no empty charts).
- No third-party APM wired in (Spernakit does not ship Sentry / New Relic / Datadog integrations; if one is added it must be explicitly approved and documented).

## Structured Logging and Log Rotation

Spernakit logs through `backend/src/utils/logger.ts` (pino). Logs go to console and to rotating files under `/app/logs`, which is a mounted volume.

Audit checks:

- pino is the logger in use (no winston, no ad-hoc `console.log` in production paths).
- Log rotation settings (size + retention) keep `/app/logs` bounded.
- `docker inspect` confirms `logging.driver: json-file` with `max-size` and `max-file` caps so the container's stdout/stderr ring buffer does not grow unbounded.
- Logs include the correlation IDs (`X-Request-ID`, `X-Session-ID`) from the request-correlation plugin.
- No secrets, tokens, or PII in log output (spot-check recent entries).

## Alerting and Incident Response

The `alerting` config section controls how health-check failures and integrity issues notify operators. Channels: in-app notifications, email, and webhook.

Reference default shape (from `backend/src/config/defaults.json`):

```json
{
	"alerting": {
		"cooldownMinutes": 15,
		"email": { "enabled": false, "recipients": [] },
		"inApp": { "enabled": true },
		"webhook": { "enabled": false, "headers": {}, "secret": "", "timeoutMs": 5000, "url": "" }
	}
}
```

Audit checks:

- At least one delivery channel is enabled for production (inApp alone may be insufficient if no one is watching the UI).
- `cooldownMinutes` is set to avoid alert storms.
- If `email.enabled`, recipients list is non-empty and SMTP config is valid.
- If `webhook.enabled`, the webhook URL is reachable, uses a shared secret, and enforces a request timeout.
- `healthAlertService` integration exercises each configured channel (test alert fires end-to-end).
- Incident response runbook exists: where to look (logs, metrics, health page), how to roll back, whom to notify.

## Audit Log Archival

Spernakit writes to `audit_logs` via the `audit` plugin (pino-backed, DB-persisted). These rows grow forever unless managed.

Audit checks:

- `audit.enabled: true` in production.
- `audit.ipWhitelist` reviewed (should not silence real users).
- An archival / pruning job exists (or is explicitly deferred with a documented retention policy).
- `audit_logs` row count and table size are tracked.

## Scheduled Task and Process Monitoring

Two layers run inside the container: supervisord-managed processes and application-level scheduled jobs (backups, integrity checks, vacuum, alert cooldowns).

Audit checks:

- `supervisorctl status` shows `nginx RUNNING` and `backend RUNNING`.
- `database.backup.intervalHours`, `database.integrityCheck.intervalHours`, and `database.vacuum.intervalHours` align with your operational expectations.
- Last-run timestamps for each scheduled job are visible (via admin UI or DB query) and are recent.
- Failed runs surface via the alerting channels above.

## Database Backup Verification

The Spernakit backup service writes SQLite snapshots to `/app/backups`.

```bash
# Confirm backup volume and recent files
docker exec <container> ls -lh /app/backups/

# Backup config in effective JSON
docker exec <container> sh -c 'cat /app/config/*.json' | grep -A 8 '"backup"'
```

Audit checks:

- `database.backup.enabled: true`.
- `intervalHours` and `retentionDays` set and files match (count and age).
- `encrypt: true` in production (and you know where the decryption key lives).
- At least one **restore drill** within the review cycle: copy a backup to a test environment, verify the app starts against it.
- Backups are stored off the primary host (host-side rsync, S3, restic, etc.); mounting `/app/backups` to the same disk as `/app/data` provides no disaster protection.

## Resource Utilization

Spernakit's compose sets `memory: 512M`, `cpus: '1.0'` as a default; increase deliberately per workload.

```bash
# Point-in-time
docker stats --no-stream <container>

# Disk usage inside the volumes
docker exec <container> du -sh /app/data /app/logs /app/backups
```

Audit checks:

- Memory usage sits comfortably below the container limit under normal load; no OOMKilled history (`docker inspect <container> | grep OOMKilled`).
- CPU headroom exists for p95 request bursts.
- `/app/data`, `/app/logs`, `/app/backups` disk growth is monitored; host has enough free space for the declared retention windows.
- No runaway log or audit-log growth.

## Audit Checklist

### **Critical Deployment Checks**

#### Container Shape

- [ ] **Critical**: Single-container image matches the Spernakit reference (nginx + supervisord + Bun)
- [ ] **Critical**: Only the frontend port exposed; backend port 3331 not published to the host
- [ ] **Critical**: Container runs as non-root (`bun` user)
- [ ] **Critical**: `read_only: true` with explicit tmpfs for nginx / supervisor / tmp
- [ ] **Critical**: `cap_drop: [ALL]` and `no-new-privileges:true`

#### Configuration and Secrets

- [ ] **Critical**: Config mounted as `/app/config` (JSON only; no `.env` files)
- [ ] **Critical**: All required `{SLUG_UPPER}_*` secret envs injected at runtime, not baked into the image
- [ ] **Critical**: No plaintext secrets committed to the repo or visible in the image
- [ ] **Critical**: `cookieSecure: true` when served via HTTPS

#### Deployment Safety

- [ ] **Critical**: Image tag pinned (no `:latest` in production compose)
- [ ] **Critical**: Rollback to previous image tag documented and tested
- [ ] **Critical**: Docker `HEALTHCHECK` configured and passing
- [ ] **Critical**: Reverse proxy handles TLS; container port bound to `127.0.0.1`

### **High Priority Checks**

#### Observability

- [ ] **High**: `healthService` endpoint `/api/v1/health` returns 200 and includes component statuses
- [ ] **High**: `metricsService` collecting (admin dashboard renders data)
- [ ] **High**: pino structured JSON logging in use; correlation IDs present
- [ ] **High**: Log rotation caps `/app/logs` disk growth
- [ ] **High**: Docker `logging.options` caps container stdout ring buffer

#### Alerting and Incident Response

- [ ] **High**: At least one alerting channel enabled in production (`email` or `webhook`, beyond `inApp`)
- [ ] **High**: `alerting.cooldownMinutes` set to a sane value (default 15)
- [ ] **High**: Health-check alert fires end-to-end in a test
- [ ] **High**: Incident runbook exists (log/metric locations, rollback steps, escalation)

#### Backups and Data

- [ ] **High**: `database.backup.enabled: true`, encryption on, retention set
- [ ] **High**: Backups stored off the primary host volume
- [ ] **High**: Restore drill performed within the audit window
- [ ] **High**: Integrity check (`database.integrityCheck`) scheduled and passing

### **Medium Priority Checks**

#### Reverse Proxy and TLS

- [ ] **Medium**: HTTPS enforced (HSTS header, HTTP→HTTPS redirect)
- [ ] **Medium**: Certificate auto-renewal configured (Caddy / Traefik / certbot)
- [ ] **Medium**: Proxy forwards `X-Forwarded-For` / `X-Forwarded-Proto` and backend `trustProxy: true`

#### Resource Controls

- [ ] **Medium**: Compose `deploy.resources.limits` set for memory and CPU
- [ ] **Medium**: No `OOMKilled` events in the recent container history
- [ ] **Medium**: Disk free on host covers declared retention windows

#### Audit Logs

- [ ] **Medium**: `audit.enabled: true` in production
- [ ] **Medium**: `audit_logs` size tracked; archival or pruning strategy in place

### **Low Priority Checks**

#### Documentation

- [ ] **Low**: Deployment runbook up to date with current image build command
- [ ] **Low**: Rollback runbook lists last three known-good image tags
- [ ] **Low**: Reverse proxy configuration is in version control
- [ ] **Low**: Incident postmortems filed for each alert-triggering event

#### Optimization

- [ ] **Low**: Image size trend reviewed (multi-stage build not regressing)
- [ ] **Low**: `HEALTHCHECK` `start_period` tuned to actual cold-start time
- [ ] **Low**: Alert noise reviewed; false-positive rules tightened

## Report Template

```markdown
# Deployment Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Deployment Score**: [Score]/100
**Image Tag Deployed**: [tag]
**Deployment Frequency**: [Number] per [week/month]
**Mean Time to Recovery**: [Minutes]

### Risk Level: [LOW/MEDIUM/HIGH/CRITICAL]

## Container and Image

- **Base image**: [oven/bun:1.3.14-alpine@sha256:...]
- **Exposed ports**: [list]
- **Runs as non-root**: [Yes/No]
- **Read-only rootfs**: [Yes/No]
- **Capabilities dropped**: [Yes/No]
- **Image tag pinned**: [Yes/No] ([value])

## Configuration and Secrets

- **Config mount**: [path → /app/config]
- **Secret envs present**: [list of `{SLUG}_*` vars observed]
- **Plaintext secrets found**: [None / list]
- **`cookieSecure`**: [true/false]

## Reverse Proxy and TLS

- **Proxy**: [Caddy/Traefik/nginx/other]
- **Cert auto-renewal**: [Yes/No]
- **HSTS**: [Yes/No]
- **Container bound to loopback**: [Yes/No]

## Health, Metrics, and Logging

- **Health endpoint**: [Pass/Fail]
- **Supervisord processes**: nginx [RUNNING/FAIL], backend [RUNNING/FAIL]
- **Metrics dashboard renders**: [Yes/No]
- **pino in use**: [Yes/No]
- **Log rotation**: [Yes/No]
- **Correlation IDs in logs**: [Yes/No]

## Alerting

- **Channels enabled**: [inApp/email/webhook]
- **Cooldown**: [minutes]
- **Test alert fired end-to-end**: [Yes/No]
- **Runbook linked**: [Yes/No]

## Backups

- **Backup enabled**: [Yes/No]
- **Encrypted**: [Yes/No]
- **Retention**: [days]
- **Off-host storage**: [Yes/No]
- **Restore drill performed**: [Yes/No] ([date])

## Resource Utilization

- **Memory limit / observed**: [512M / Xm]
- **CPU limit / observed**: [1.0 / X.X]
- **`/app/data` size**: [value]
- **`/app/logs` size**: [value]
- **`/app/backups` size**: [value]
- **OOMKilled in window**: [Yes/No]

## Critical Findings 🚨

| ID   | Issue         | Severity | Impact   | Remediation | Timeline |
| ---- | ------------- | -------- | -------- | ----------- | -------- |
| [ID] | [Description] | Critical | [Impact] | [Fix]       | 0-24h    |

## Monitoring Gaps

### Missing Coverage

1. [Area] - **Priority**: [High/Medium/Low]
2. [Area] - **Priority**: [High/Medium/Low]

### Alert Gaps

1. [Condition] - **Priority**: [High/Medium/Low]
2. [Condition] - **Priority**: [High/Medium/Low]

## Recommendations

### Immediate (0-24 hours)

1. [Action]

### Short-term (1-7 days)

1. [Action]

### Long-term (1-3 months)

1. [Action]

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

## Deliverables

### Required Outputs

- **Container and image assessment**: shape matches Spernakit reference; security posture (non-root, read-only, cap_drop) verified.
- **Configuration and secrets review**: JSON mount + env-injected secrets; no plaintext leaks.
- **Reverse proxy and TLS report**: external termination, auto-renewal, HSTS.
- **Runtime observability report**: `healthService`, `metricsService`, pino logs, correlation IDs.
- **Alerting report**: channels enabled, cooldown sane, end-to-end test.
- **Backup and recovery report**: encryption, retention, off-host storage, restore drill.
- **Resource utilization report**: memory/CPU headroom, disk growth, OOM history.
- **Remediation plan**: prioritized list of gaps.

### Success Criteria

- **Shape preserved**: production container matches the Spernakit reference Dockerfile and compose.
- **Observable**: health, metrics, logs, and alerts all functional end-to-end.
- **Recoverable**: documented rollback, tested backup restore, pinned image tags.
- **Bounded**: disk, memory, and CPU usage live within declared limits; no unbounded growth.
- **Secure at the edge**: TLS terminated externally, container bound to loopback, secrets never baked into the image.

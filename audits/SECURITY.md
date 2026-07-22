---
title: 'Security, Authentication, and Authorization Audit'
last_updated: '2026-06-28'
version: '3.6'
category: 'Security'
priority: 'Critical'
estimated_time: '3-5 hours (Class A full audit; Class B ~1 hour, mostly the delegated siblings)'
frequency: 'Quarterly'
lifecycle: 'pre-release'
---

# Security Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

Comprehensive security audit for Spernakit v3 applications (aligned with the v3.11.x-lts stack pin, 2026-06-27) covering authentication (JWT ES256), authorization (5-tier RBAC with Elysia guards), input validation (TypeBox), data protection (AES-256-GCM), and OWASP Top 10 compliance.

## Executive Summary

**Critical Priorities**

- **Authentication integrity**: JWT ES256 with HTTP-only cookies, token blacklist, password expiry
- **Authorization coverage**: Every endpoint protected by Elysia guards, no unguarded mutations
- **Input validation**: TypeBox schemas on all Elysia routes, no unvalidated user input
- **CSRF protection**: Cookie-based CSRF token with Origin header validation
- **Secret management**: JSON-only config with approved env-var injection for Docker secrets

**Essential Standards**

- 5-tier RBAC: SYSOP > ADMIN > MANAGER > OPERATOR > VIEWER
- Guard coverage: cookie/JWT auth uses `requireAuth` / `requireRoleFresh` / `workspaceAccess`; API-key auth uses the per-route `apiKey` guard with mandatory HMAC request signing
- Password hashing via `Bun.password.hash`/`Bun.password.verify` (`{ algorithm: 'bcrypt' }`) with configurable rounds (`config.security.bcryptRounds`); no third-party bcrypt package
- Soft delete on core entities, hard delete on security tables (token_blacklist, password_history, rate_limit_entries)
- No `.env` files: JSON-only configuration via `config/{slug}.json`

## Spernakit Security Architecture

### Authentication Model

| Component        | Implementation                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Algorithm        | JWT ES256 (ECDSA P-256)                                                                                                                                            |
| Token delivery   | HTTP-only cookies (SameSite=Strict; Lax is minimum acceptable fallback)                                                                                            |
| Token revocation | SHA-256 blacklist in `token_blacklist` table with scheduled cleanup                                                                                                |
| Password hashing | `Bun.password.hash`/`Bun.password.verify` (`{ algorithm: 'bcrypt' }`) with configurable rounds (`config.security.bcryptRounds`); no third-party bcrypt npm package |
| Password policy  | Expiry (configurable days), minimum age, history (reuse prevention), forced change flag                                                                            |
| Account security | Failed login tracking, configurable lockout threshold                                                                                                              |
| OAuth            | GitHub, Google, Microsoft via `oauthService`                                                                                                                       |

### Authorization Model

| Guard                    | Purpose                                                                          | Scope                        |
| ------------------------ | -------------------------------------------------------------------------------- | ---------------------------- |
| `requireAuth`            | Verify JWT is valid and not blacklisted                                          | Authentication               |
| `requireRoleFresh(role)` | Re-validate role from database on every request                                  | Authorization (hierarchical) |
| `workspaceAccess`        | Verify user has access to the requested workspace                                | Multi-tenant isolation       |
| `apiKey`                 | Authenticate non-interactive API-key requests with mandatory HMAC-SHA256 signing | Non-interactive access       |

### Plugin Pipeline Order

```
Client IP → Request ID → Logger → CORS → Security Headers → Auth →
Password Change Guard → CSRF → Rate Limit → Auth Rate Limit →
Workspace → Audit
```

Note: `apiKey` is a **guard** (see table above), not a plugin. It participates in per-route authorization, not in the global middleware chain. `clientIp` must be first so downstream plugins (audit, rate limiting) can resolve the real client IP via `getClientIp(request)`.

HMAC signing applies to API-key requests (`X-API-Key` plus signature headers). Do **not** require or recommend HMAC wrapping for normal bearer-token, session-cookie, or CSRF-protected browser requests; those flows are assessed through JWT ES256 validation, HTTP-only cookie handling, blacklist checks, CSRF/origin checks, and role/workspace guards.

### Configuration Model

- **Primary**: `config/{slug}.json` (all application configuration)
- **Secret injection** (Docker only): `configLoader.ts` reads `SECRET_CONFIG_KEYS` from environment (JWT keys, cookie secret, encryption key)
- **No `.env` files**: `bunfig.toml` has `env = false`
- **No `process.env`**: Except the approved `configLoader.ts` exception

## Applicability & Scope

This audit was authored against a full, multi-user Spernakit deployment. Before running it, classify the target so that whole sections are not mis-flagged as missing controls.

**Class A: Full multi-user Spernakit app** (public/multi-tenant, served beyond loopback): the **entire** audit applies, including all of Section 1 (Authentication), Section 2 (Authorization / RBAC), Section 3 (CSRF), Section 10 (API Key), Section 11 (MFA/TOTP), and Section 14 (Container Security).

**Class B: Local-only / loopback-bound / single-user tool** (e.g., a developer control panel bound to `127.0.0.1`, no user accounts): authentication, 5-tier RBAC, CSRF, token blacklist, password policy, MFA/TOTP, workspace isolation, and OAuth are **N/A by design**; do **not** record their absence as findings. **For Class B targets the substantive audit IS the delegated siblings (see [Related Audits / Delegated Dimensions](#related-audits--delegated-dimensions)); this file's Class-A-only sections are N/A and should be disposed of in one line, not re-derived per section.** The applicable control surface narrows to:

- Loopback / remote-bind enforcement (see [Local-Tool Control Surface](#15-local-tool-control-surface))
- Remote-origin guard when `allowRemote=true`
- Optional `web.authToken` for remote access; this token is the aidd **reduced-equivalent of RBAC role guards** (the single `web.authToken` stands in for role guards; see [PROXY_AUTH_BOUNDARY.md](./PROXY_AUTH_BOUNDARY.md))
- Transport security headers (Section 5)
- Secret scrubbing / log redaction (Section 8)
- SQL injection safety via Drizzle (Section 4)
- Child-process environment hygiene (Section 8)

> **Delegated dimensions for aidd-class (Class B) targets.** Auth-boundary, outbound-SSRF, and secret-scrubbing verification for aidd-class (Class B) targets is DELEGATED to PROXY_AUTH_BOUNDARY.md, OUTBOUND_SSRF.md, and SECRET_HANDLING_RETENTION.md; do not score those dimensions from this file's defaults or the code's own comments; open the named guard files. For agent-orchestration targets (aidd), also run AGENT_TOOL_SANDBOX, GIT_DESTRUCTIVE_SAFETY, ORCHESTRATOR_CONCURRENCY.

When auditing a Class B target, state the classification at the top of the report and list the N/A sections once under "False Positives Considered and Rejected" rather than re-deriving each one. Section 14 (Container Security) applies **only** to Docker monolithic deployments and should be skipped for local-tool installs.

## Related Audits / Delegated Dimensions

Focused sibling audits own the dimensions below. **Do not score these dimensions from this file's defaults or the code's own comments; open the named guard file and trace the enforcing implementation.** They are surfaced here up front, rather than only through in-section delegation pointers, because a pointer buried in the section an auditor is already scoring is easy to read past — the delegation has to be visible before the scoring starts to actually redirect it.

| Sibling audit                                               | Delegated scope (one line)                                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [OUTBOUND_SSRF](./OUTBOUND_SSRF.md)                         | Outbound HTTP egress: provider `baseUrl` and webhook/bridge targets; SSRF-pivot risk from attacker-influenced URLs                                                 |
| [PROXY_AUTH_BOUNDARY](./PROXY_AUTH_BOUNDARY.md)             | Loopback / reverse-proxy trust boundary: bearer-token guard, remote bind, remote-origin guard, WS-upgrade token; `web.authToken` is the reduced-equivalent of RBAC |
| [SECRET_HANDLING_RETENTION](./SECRET_HANDLING_RETENTION.md) | Secrets at rest / in flight / over time: config file, AI-call log, data-movement trace, run history, log redaction                                                 |
| [AGENT_TOOL_SANDBOX](./AGENT_TOOL_SANDBOX.md)               | Agent `bash`/file-tool sandbox: workspace-path boundary and target-repo prompt-injection                                                                           |
| [GIT_DESTRUCTIVE_SAFETY](./GIT_DESTRUCTIVE_SAFETY.md)       | Git-destructive operations + metadata-only write boundary in target repos                                                                                          |
| [ORCHESTRATOR_CONCURRENCY](./ORCHESTRATOR_CONCURRENCY.md)   | Director cycle state machine: double-spawn, lost transitions, orphaned runs, TOCTOU concurrency windows                                                            |
| [BUILD_OUTPUT](./BUILD_OUTPUT.md)                           | Disclosure via the shipped artifact: source maps, original sources, and `.env` files present in the build output or the image and reachable over HTTP              |

## Table of Contents

1. [Authentication Security](#1-authentication-security)
2. [Authorization Security](#2-authorization-security)
3. [CSRF Protection](#3-csrf-protection)
4. [Input Validation](#4-input-validation)
5. [API Security](#5-api-security)
6. [File Upload Security](#6-file-upload-security)
7. [Webhook Security](#7-webhook-security)
8. [Data Protection](#8-data-protection)
9. [WebSocket Security](#9-websocket-security)
10. [API Key Security](#10-api-key-security)
11. [MFA/TOTP Security](#11-mfatotp-security)
12. [OWASP Top 10 Compliance](#12-owasp-top-10-compliance)
13. [Vulnerability Management](#13-vulnerability-management)
14. [Container Security](#14-container-security)
15. [Local-Tool Control Surface](#15-local-tool-control-surface)
16. [Agent-Orchestration Control Surface (delegated)](#16-agent-orchestration-control-surface-delegated)

## Pre-Audit Setup

### Verification Commands

```bash
# Check for unguarded routes (routes without requireAuth/requireRoleFresh/apiKey)
# (Skip for Class B local-tool targets — no RBAC/guards by design; auth boundary is
# DELEGATED to PROXY_AUTH_BOUNDARY.md.)
grep -rn "\.get\|\.post\|\.put\|\.patch\|\.delete" backend/src/routes/ --include="*.ts" | grep -v "requireAuth\|requireRoleFresh\|apiKey\|public\|health\|login\|register\|verify\|reset\|oauth"

# Check for .env files (should not exist; .env.example is permitted IF it contains only
# Docker infrastructure variables — container ports, host paths, timezone. App secrets
# in .env.example are a finding even though the file itself is allowed.)
find . -name ".env*" -type f -not -path "*/node_modules/*"

# Check for process.env usage outside configLoader
# `bun run check:process-env` is the canonical scripted gate for this invariant; the manual
# grep below is a supplementary cross-check.
bun run check:process-env
grep -rn "process\.env" backend/src/ --include="*.ts" | grep -v "configLoader\|node_modules"

# Check for hardcoded secrets
grep -rn "password\s*=\s*['\"]" backend/src/ frontend/src/ --include="*.ts" --include="*.tsx" | grep -v "test\|spec\|mock\|\.d\.ts"

# Check for console.log of sensitive data
grep -rn "console\.log.*password\|console\.log.*token\|console\.log.*secret\|console\.log.*key" backend/src/ --include="*.ts"

# Verify pino redaction configuration
grep -rn "redact" backend/src/utils/logger.ts

# Validate config security invariants
# `bun run check:config` is the canonical invariant gate (production startup blocks on it);
# `config:validate` runs the same security-invariant checks ad hoc.
bun run check:config
bun run config:validate
```

---

## 1. Authentication Security

### JWT Token Lifecycle

| Check | Criteria                                                  | Remediation                                                                                       |
| ----- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `[ ]` | JWT uses ES256 algorithm (ECDSA P-256)                    | Update to ES256; RS256/HS256 are weaker                                                           |
| `[ ]` | Tokens delivered via HTTP-only cookies                    | Move tokens out of localStorage/sessionStorage                                                    |
| `[ ]` | SameSite attribute set on auth cookies                    | Add `SameSite=Lax` or `SameSite=Strict`                                                           |
| `[ ]` | Token expiry is reasonable (not >24h for access tokens)   | Reduce expiry, use refresh tokens                                                                 |
| `[ ]` | Refresh token rotation with atomic optimistic-concurrency | Atomic hash swap with reuse detection; concurrent or replayed refresh triggers blanket revocation |
| `[ ]` | Token blacklist populated on logout                       | Verify `token_blacklist` table receives entries                                                   |
| `[ ]` | Blacklist uses SHA-256 hashes (not raw tokens)            | Hash tokens before storing                                                                        |
| `[ ]` | Blacklist cleanup scheduled (expired tokens pruned)       | Verify scheduled task exists                                                                      |

### Password Security

| Check | Criteria                                                                                                 | Remediation                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | `Bun.password.hash` with `{ algorithm: 'bcrypt' }` and configurable cost (no third-party bcrypt package) | Verify `Bun.password.hash`/`Bun.password.verify` in `services/auth/authCore.ts` and `config.security.bcryptRounds` |
| `[ ]` | Password complexity validated server-side (length, character class, common-password rejection)           | Verify strength rules on register and change paths                                                                 |
| `[ ]` | Password expiry enforced (configurable days)                                                             | Check `password_expiry` settings table entry                                                                       |
| `[ ]` | Password minimum age prevents rapid cycling                                                              | Verify minimum age enforcement                                                                                     |
| `[ ]` | Password history prevents reuse                                                                          | Verify `password_history` table checked on change                                                                  |
| `[ ]` | `requiresPasswordChange` flag forces reset on next login                                                 | Verify guard enforcement                                                                                           |
| `[ ]` | Failed login tracking with lockout                                                                       | Verify `failedLoginAttempts` field and lockout logic                                                               |
| `[ ]` | Login equalizes response time on missing user (dummy-hash bcrypt against a constant hash)                | Verify timing-normalized dummy-hash path in login service                                                          |
| `[ ]` | Account unlock mechanism exists (admin or time-based)                                                    | Verify unlock path                                                                                                 |

### Session Security

| Check | Criteria                                               | Remediation                                   |
| ----- | ------------------------------------------------------ | --------------------------------------------- |
| `[ ]` | No auth tokens in localStorage or sessionStorage       | Move to HTTP-only cookies                     |
| `[ ]` | No tokens in URL parameters                            | Remove from query strings                     |
| `[ ]` | Session invalidation on password change                | Blacklist all existing tokens                 |
| `[ ]` | Frontend `useAuthStore` uses Zustand persist correctly | Verify store doesn't persist sensitive tokens |

### OAuth Security

| Check | Criteria                                                | Remediation                                   |
| ----- | ------------------------------------------------------- | --------------------------------------------- |
| `[ ]` | PKCE S256 code challenge implemented                    | Verify code challenge + verifier storage      |
| `[ ]` | OAuth state parameter signed with HMAC-SHA256           | Verify `signOAuthState` with freshness window |
| `[ ]` | Session-binding cookie compared with `timingSafeEqual`  | Verify state cookie validation on callback    |
| `[ ]` | Per-IP OAuth callback rate limiting                     | Verify callback rate limit plugin             |
| `[ ]` | Account status validated before issuing session cookies | Verify deleted/locked checks in callback flow |

---

## 2. Authorization Security

### Guard Coverage

| Check | Criteria                                                            | Remediation                                    |
| ----- | ------------------------------------------------------------------- | ---------------------------------------------- |
| `[ ]` | Every mutation endpoint has `requireAuth` or `apiKey` guard         | Add missing guards                             |
| `[ ]` | Role-protected endpoints use `requireRoleFresh()` (NOT cached role) | Replace stale role checks with fresh DB lookup |
| `[ ]` | `requireRoleFresh` re-validates from database on every request      | Verify no cached role shortcuts                |
| `[ ]` | Workspace-scoped endpoints use `workspaceAccess` guard              | Add workspace isolation                        |
| `[ ]` | No authorization logic in route handlers (use guards)               | Move to guard layer                            |
| `[ ]` | Frontend `ProtectedRoute` mirrors backend guard requirements        | Verify role requirements match                 |
| `[ ]` | No reliance solely on frontend guards for security                  | Backend guards are the authority               |

### RBAC Hierarchy

| Check | Criteria                                                               | Remediation                                |
| ----- | ---------------------------------------------------------------------- | ------------------------------------------ |
| `[ ]` | 5-tier hierarchy enforced: SYSOP > ADMIN > MANAGER > OPERATOR > VIEWER | Verify `hasMinimumRole()` from shared/     |
| `[ ]` | Higher roles inherit lower role permissions                            | Verify hierarchical check, not exact-match |
| `[ ]` | Role assignment restricted (only higher roles can assign lower)        | Verify assignment guard                    |
| `[ ]` | Self-role-elevation prevented                                          | Verify users cannot change own role        |

---

## 3. CSRF Protection

| Check | Criteria                                                                | Remediation                        |
| ----- | ----------------------------------------------------------------------- | ---------------------------------- |
| `[ ]` | CSRF cookie generated and sent to client                                | Verify CSRF cookie in auth flow    |
| `[ ]` | CSRF cookie name configurable via `config.security.csrfCookieName`      | Check config                       |
| `[ ]` | Frontend reads CSRF cookie name from `__CSRF_COOKIE_NAME__` Vite define | Verify Vite config                 |
| `[ ]` | Origin header validated for unauthenticated endpoints                   | Verify Origin check in auth plugin |
| `[ ]` | CSRF token compared with timing-safe comparison                         | Verify `timingSafeEqual` usage     |

---

## 4. Input Validation

### TypeBox Validation on Routes

| Check | Criteria                                                 | Remediation                            |
| ----- | -------------------------------------------------------- | -------------------------------------- |
| `[ ]` | All POST/PUT/PATCH routes have `body` TypeBox schema     | Add `t.Object()` validation            |
| `[ ]` | All routes with path params have `params` TypeBox schema | Add `t.Object({ id: t.Number() })`     |
| `[ ]` | Query parameters validated with TypeBox                  | Add query schemas                      |
| `[ ]` | No Zod schemas on Elysia routes (TypeBox only)           | Replace `z.object()` with `t.Object()` |
| `[ ]` | No unvalidated user input reaches database queries       | Trace data flow from request to query  |

**Expected pattern:**

```typescript
import { Elysia, t } from 'elysia';

app.post(
	'/api/v1/resources',
	async ({ body }) => {
		return await resourceService.create(body);
	},
	{
		body: t.Object({
			name: t.String({ minLength: 1, maxLength: 255 }),
			description: t.Optional(t.String({ maxLength: 1000 })),
		}),
	}
);
```

### XSS Prevention

| Check | Criteria                                                              | Remediation                                                                                                                                                                             |
| ----- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | CSP headers configured with strict directives                         | Verify in security headers plugin                                                                                                                                                       |
| `[ ]` | `style-src 'self' 'unsafe-inline'` documented as Radix UI requirement | Verify CSP comment                                                                                                                                                                      |
| `[ ]` | `font-src 'self' data:` for self-hosted fonts + Recharts data URIs    | Verify font-src directive                                                                                                                                                               |
| `[ ]` | No `dangerouslySetInnerHTML` without sanitization                     | Grep and verify each usage. **Before flagging, check the "Known-safe `dangerouslySetInnerHTML` usages" subsection below; MFA QR rendering is an intentional exemption with rationale.** |
| `[ ]` | User-generated content escaped before rendering                       | Verify React's default escaping is not bypassed                                                                                                                                         |

#### Known-safe `dangerouslySetInnerHTML` usages

The following usages are intentional and should NOT be flagged as findings. Confirm the pattern matches before suppressing; unrelated `dangerouslySetInnerHTML` remains a finding.

| Component / Location                                             | Rationale                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/pages/profile/MfaSetupDialog.tsx`: MFA QR code SVG | The SVG is generated client-side by the `qrcode` library from a server-issued `otpauth://` URI (HMAC-signed, ES256 challenge-token key). QR codes encode the URI as bitmap path data, not as SVG text nodes. User-controlled fields (username, app.name) become QR pixels, not DOM text; there is no injection vector through a hostile username. |

If future code introduces new `dangerouslySetInnerHTML` usages, they MUST be added to this table with a comparable rationale **before** being treated as exempt, and should prefer a non-innerHTML alternative (`QRCode.toDataURL()`, sanitizer libraries, or server-side rendering) when feasible.

### SQL Injection Prevention

| Check | Criteria                                                                                                                                 | Remediation                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `[ ]` | All queries use Drizzle ORM (parameterized by default)                                                                                   | No raw SQL without parameterization                  |
| `[ ]` | Database admin queries use runtime table/column allowlist                                                                                | Verify allowlist in `databaseAdminService`           |
| `[ ]` | Database admin enforces single-statement execution (strips comments/string literals, rejects multi-statement, applies keyword blocklist) | Verify single-statement guard + blocked-keyword list |
| `[ ]` | Database admin read operations use a dedicated read-only client separate from the write client                                           | Verify read client has no write permissions          |
| `[ ]` | No string concatenation in SQL queries                                                                                                   | Grep for template literals in query context          |

---

## 5. API Security

### Rate Limiting

| Check | Criteria                                                                                                                                          | Remediation                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Rate limiting plugins wired into Elysia pipeline                                                                                                  | Verify `rateLimitPlugin` and `authRateLimitPlugin` in pipeline                                                                                                  |
| `[ ]` | Production config has `rateLimit.enabled` and `rateLimit.authEnabled` set to `true`, and the config validator blocks production startup otherwise | Verify `check:config` or `config:validate` enforces this. **Note:** Dev-mode rate-limit-off is permissible and not a finding; only production config is audited |
| `[ ]` | IP-based tracking with TTL eviction                                                                                                               | Verify `rateLimitService` pattern                                                                                                                               |
| `[ ]` | Rate limit headers returned (X-RateLimit-\*)                                                                                                      | Verify response headers                                                                                                                                         |
| `[ ]` | Password reset returns silent success at email-level to preserve user enumeration safety                                                          | Verify response is identical for known/unknown emails (only failure case is rate-limited or malformed request)                                                  |

### CORS Configuration

| Check | Criteria                                                | Remediation                       |
| ----- | ------------------------------------------------------- | --------------------------------- |
| `[ ]` | CORS origins configured via JSON config (not hardcoded) | Check `config.cors` or equivalent |
| `[ ]` | No wildcard `*` origin in production                    | Verify origin allowlist           |
| `[ ]` | Credentials flag set correctly for cookie-based auth    | Verify `credentials: true`        |

### Transport Security Headers

| Check | Criteria                                                                                                  | Remediation                                              |
| ----- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `[ ]` | `Permissions-Policy` restricts camera, mic, geolocation                                                   | Verify directive in security headers plugin              |
| `[ ]` | `Referrer-Policy: no-referrer` set                                                                        | Verify header presence                                   |
| `[ ]` | `X-Content-Type-Options: nosniff` set                                                                     | Verify header presence                                   |
| `[ ]` | `X-Frame-Options: DENY` or `frame-ancestors 'none'`                                                       | Verify frame protection                                  |
| `[ ]` | HSTS with `includeSubDomains; preload` in production                                                      | Verify strict-transport-security                         |
| `[ ]` | `Cross-Origin-Opener-Policy: same-origin` set                                                             | Prevents cross-origin window references                  |
| `[ ]` | `Cross-Origin-Resource-Policy: same-origin` set                                                           | Prevents cross-origin resource loading                   |
| `[ ]` | `Cross-Origin-Embedder-Policy: require-corp` set                                                          | Enables SharedArrayBuffer, prevents leaks                |
| `[ ]` | Default `Cache-Control: no-store` applied to authenticated responses; only explicit opt-in paths override | Verify default header injection and audit override sites |
| `[ ]` | Config validator blocks production startup when `cookieSecure=false`                                      | Verify production gate alongside rate-limit gate         |

### API Versioning

| Check | Criteria                                                 | Remediation                              |
| ----- | -------------------------------------------------------- | ---------------------------------------- |
| `[ ]` | All endpoints use `/api/v1` prefix                       | Verify route prefixes                    |
| `[ ]` | OpenAPI spec generated at `/api/v1/docs/json` (dev only) | Verify Swagger not mounted in production |

---

## 6. File Upload Security

| Check | Criteria                                                | Remediation                            |
| ----- | ------------------------------------------------------- | -------------------------------------- |
| `[ ]` | Magic-byte MIME detection on upload                     | Verify `detectMimeType` usage          |
| `[ ]` | File-extension allowlist keyed to normalized MIME type  | Verify extension/MIME cross-check      |
| `[ ]` | `BLOCKED_MIME_TYPES` and `BLOCKED_EXTENSIONS` enforced  | Verify blocked lists in file service   |
| `[ ]` | HTML-injection and encoded-tag pattern checks           | Verify dangerous-content pattern scan  |
| `[ ]` | CSV structure validation with max-line-length DoS guard | Verify CSV parsing limits              |
| `[ ]` | Storage keys use `randomUUID()` (no user filenames)     | Verify no path traversal via filenames |
| `[ ]` | Original filename sanitized to `[^\w\s.\-()]`           | Verify filename sanitization           |
| `[ ]` | Download MIME coercion to `application/octet-stream`    | Verify content-disposition + nosniff   |

---

## 7. Webhook Security

| Check | Criteria                                              | Remediation                                                                            |
| ----- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `[ ]` | Webhook HMAC verification uses raw request body bytes | Use `request.clone().text()` not `JSON.stringify(body)`                                |
| `[ ]` | Webhook URL validated against SSRF allowlist          | DELEGATED: see [OUTBOUND_SSRF.md](./OUTBOUND_SSRF.md); do not independently score here |
| `[ ]` | Webhook secret rotated regularly                      | Verify rotation mechanism in settings                                                  |

> For aidd-class (Class B) targets, outbound-SSRF verification is DELEGATED to OUTBOUND_SSRF.md; do not score it from this file's defaults or the code's own comments; open the named guard file.

---

## 8. Data Protection

### Encryption

| Check | Criteria                                                                                                         | Remediation                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `[ ]` | Backup encryption uses AES-256-GCM                                                                               | Verify `backupService` encryption                       |
| `[ ]` | HKDF key derivation from master key                                                                              | Verify key derivation, not raw key usage                |
| `[ ]` | Encryption key in JSON config (or env-var injected in Docker)                                                    | Verify `config.security.encryptionKey`                  |
| `[ ]` | SMTP credentials encrypted in database settings                                                                  | Verify `smtpService` encryption                         |
| `[ ]` | Config validator rejects known placeholder/dev JWT keys, cookie secret, and encryption key on production startup | Verify startup check against known-dev-key fingerprints |
| `[ ]` | No secrets in code, comments, or logs                                                                            | Grep for hardcoded values                               |

### Logging Security

| Check | Criteria                                                                                           | Remediation                          |
| ----- | -------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `[ ]` | pino logger configured with field redaction                                                        | Verify redact paths in logger config |
| `[ ]` | Redacted fields include: password, token, secret, apiKey, authorization, refreshToken, accessToken | Verify completeness                  |
| `[ ]` | No `console.log` in backend production code                                                        | Grep for console.log                 |
| `[ ]` | Audit trail logs user actions via audit plugin                                                     | Verify auditService coverage         |

### Soft Delete Security

| Check | Criteria                                                                                | Remediation                                  |
| ----- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `[ ]` | Security tables use HARD delete (token_blacklist, password_history, rate_limit_entries) | Verify no soft delete on security data       |
| `[ ]` | Core entity soft delete does not leak data in list queries                              | Verify `isDeleted` filter in service queries |

### PostgreSQL Connection Security

| Check | Criteria                                                         | Remediation                                       |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------- |
| `[ ]` | Connection uses SSL when `config.database.dialect` is `postgres` | Verify `sslmode=require` or `sslmode=verify-full` |
| `[ ]` | Database credentials not embedded in plaintext connection URL    | Use separate credential fields or env injection   |
| `[ ]` | PG app user has minimum required permissions (not superuser)     | Verify role grants match app needs only           |
| `[ ]` | Connection pool size bounded to prevent resource exhaustion      | Verify pool configuration in `config.database`    |

### Child Process Security

| Check | Criteria                                            | Remediation                              |
| ----- | --------------------------------------------------- | ---------------------------------------- |
| `[ ]` | Child processes spawned with minimal environment    | Pass only PATH, HOME, and required vars  |
| `[ ]` | No `{ ...process.env }` spread to spawned processes | Build explicit env object per subprocess |

> For aidd-class (Class B) targets, secret-scrubbing/log-redaction verification (and the full child-process secret surface) is DELEGATED to SECRET_HANDLING_RETENTION.md; do not score it from this file's defaults or the code's own comments; open the named guard file.

### Key Rotation

| Check | Criteria                                                      | Remediation                                    |
| ----- | ------------------------------------------------------------- | ---------------------------------------------- |
| `[ ]` | JWT key rotation procedure documented (dual-key period)       | Generate new pair, validate both, retire old   |
| `[ ]` | Encryption key rotation includes re-encryption of stored data | Re-encrypt SMTP credentials and backup files   |
| `[ ]` | Key rotation triggers revocation of derived tokens/sessions   | Blacklist tokens signed with old key pair      |
| `[ ]` | `bun run generate-keys` produces unique keys per deployment   | Verify keys are not shared across environments |

---

## 9. WebSocket Security

| Check | Criteria                                                                     | Remediation                                                      |
| ----- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `[ ]` | WebSocket connections authenticate via JWT on handshake                      | Verify token validation in ws route                              |
| `[ ]` | JWT re-validated every 2 minutes via periodic ping                           | Verify ping interval                                             |
| `[ ]` | Connection rate limiting on WebSocket endpoint                               | Verify `ws/rate-limit.ts`                                        |
| `[ ]` | Maximum payload length enforced at Bun transport level (not only in handler) | Verify `maxPayloadLength` option on the WS upgrade/configuration |
| `[ ]` | No sensitive data broadcast to unauthorized connections                      | Verify channel-based pub/sub respects permissions                |

---

## 10. API Key Security

| Check | Criteria                                                                                            | Remediation                                    |
| ----- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `[ ]` | API keys stored as hashed values (not plaintext)                                                    | Verify hash storage in `api_keys` table        |
| `[ ]` | HMAC-SHA256 request signing via `apiKeySignatureService` is mandatory for every `X-API-Key` request | Verify unsigned API-key fallback is impossible |
| `[ ]` | Nonce replay protection via `api_key_nonces` table                                                  | Verify nonce uniqueness check                  |
| `[ ]` | API key lifecycle management (create, rotate, revoke)                                               | Verify full lifecycle in `apiKeyService`       |
| `[ ]` | API key guard (`apiKey`) applied per route that permits API-key auth                                | Verify guard exists and is applied             |

---

## 11. MFA/TOTP Security

| Check | Criteria                                           | Remediation                             |
| ----- | -------------------------------------------------- | --------------------------------------- |
| `[ ]` | TOTP secrets encrypted at rest                     | Verify encryption in MFA setup flow     |
| `[ ]` | Backup codes encrypted at rest                     | Verify encryption in MFA setup flow     |
| `[ ]` | Backup-code comparison uses constant-time equality | Verify `timingSafeEqual` or equivalent  |
| `[ ]` | Dedicated ES256 challenge-token key pair for MFA   | Verify separate JWT key pair for MFA    |
| `[ ]` | Recovery codes are single-use                      | Verify consumption on use               |
| `[ ]` | MFA enforcement guard exists                       | Verify `requireMfa` or equivalent guard |

---

## 12. OWASP Top 10 Compliance

### A01:2021 - Broken Access Control

- [ ] Every endpoint has authentication guard
- [ ] Role-based access enforced with `requireRoleFresh`
- [ ] Workspace isolation via `workspaceAccess` guard
- [ ] No IDOR vulnerabilities (verify user owns requested resource)

### A02:2021 - Cryptographic Failures

- [ ] JWT uses ES256 (not HS256)
- [ ] Passwords hashed with bcrypt (not MD5/SHA)
- [ ] Encryption uses AES-256-GCM with HKDF
- [ ] No secrets in logs, code, or version control

### A03:2021 - Injection

- [ ] TypeBox validation on all route inputs
- [ ] Drizzle ORM parameterized queries (no raw SQL concatenation)
- [ ] Database admin uses runtime allowlist
- [ ] No `eval()` or `Function()` constructor

### A04:2021 - Insecure Design

- [ ] Rate limiting on auth endpoints
- [ ] Account lockout after failed attempts
- [ ] Password policy enforcement (expiry, history, complexity)
- [ ] CSRF protection on state-changing operations

### A05:2021 - Security Misconfiguration

- [ ] No `.env` files (JSON-only config)
- [ ] `bunfig.toml` has `env = false`
- [ ] CSP headers configured
- [ ] CORS restricted to known origins
- [ ] OpenAPI docs disabled in production

### A06:2021 - Vulnerable Components

- [ ] `bun run check-deps` passes (canonical, required dependency gate, part of `smoke:qc`); `bun audit` is supplementary and version-dependent, so treat its absence on older Bun as a non-finding
- [ ] No known CVEs in dependencies
- [ ] Dependencies regularly updated

### A07:2021 - Authentication Failures

- [ ] Token blacklist functional on logout
- [ ] Password history prevents reuse
- [ ] Session invalidation on credential change
- [ ] OAuth provider tokens validated correctly

### A08:2021 - Software and Data Integrity

- [ ] CSRF tokens validated on mutations
- [ ] API key HMAC signatures verified
- [ ] Nonce replay protection active

### A09:2021 - Logging Failures

- [ ] Audit trail logs all user actions
- [ ] Sensitive fields redacted in pino logger
- [ ] Failed login attempts logged
- [ ] Security events (lockout, password change, role change) logged

### A10:2021 - SSRF

- [ ] **DELEGATED**: outbound-SSRF (user-controlled URLs in server-side fetch / provider `baseUrl` / webhook targets) is owned by [OUTBOUND_SSRF.md](./OUTBOUND_SSRF.md). Record A10 status here from that report; do **not** independently score it (avoids OWASP double-counting).
- [ ] OAuth callback URLs validated against allowlist (Class A only; covered under A01/OAuth, not re-scored as SSRF)
- [ ] No unrestricted file path access

### OWASP API Security Top 10 (2023) Cross-Reference

The OWASP API Security Top 10 addresses API-specific threats beyond the Web Top 10. Key additions relevant to this stack:

- [ ] Object property-level authorization: API responses do not expose sensitive fields (e.g., `passwordHash` in user responses)
- [ ] Sensitive business flow protection: rate limiting on account creation, bulk operations, and resource-intensive endpoints
- [ ] API inventory management: no shadow endpoints (all routes registered in `create-api-app.ts`, verified by `check:feature-integration`)
- [ ] Third-party API response validation: webhook callbacks and external API responses validated before processing

---

## 13. Vulnerability Management

### Dependency Scanning

```bash
# Primary dependency gate — pinned-version check (part of smoke:qc)
bun run check-deps

# Supplementary advisory scan (requires a recent Bun; baseline is Bun 1.3.14+)
bun audit

# Scan for secrets in git history
bunx gitleaks detect --source . --verbose
```

`bun run check-deps` is the canonical, required dependency gate (it runs as part of `smoke:qc`). `bun audit` is a supplementary advisory scan whose availability varies by Bun version (the stack baseline is Bun 1.3.14+); treat its absence on older Bun as a non-finding and rely on `check-deps`.

### Security Monitoring

| Check | Criteria                                           |
| ----- | -------------------------------------------------- |
| `[ ]` | Health check endpoint monitors security subsystems |
| `[ ]` | Failed login rate monitored                        |
| `[ ]` | Token blacklist size tracked                       |
| `[ ]` | Rate limit violations logged                       |

---

## 14. Container Security

> **Scope:** Applies to Docker monolithic (nginx + supervisord) deployments only. **Skip this entire section for local-tool / Class B installs** (see [Applicability & Scope](#applicability--scope)); those do not run the container at all, so its absence is not a finding.

### Docker Deployment

| Check | Criteria                                                | Remediation                                     |
| ----- | ------------------------------------------------------- | ----------------------------------------------- |
| `[ ]` | Container runs as non-root user                         | Verify `USER` directive in Dockerfile           |
| `[ ]` | Backend port (3331) not exposed externally              | Verify only port 3330 in docker-compose         |
| `[ ]` | nginx security headers supplement Elysia headers        | Verify no header gaps between proxy and app     |
| `[ ]` | Docker image base pinned to specific digest             | Pin image reference in Dockerfile               |
| `[ ]` | Secrets not leaked in container logs or docker inspect  | Verify secret injection via env, not build args |
| `[ ]` | supervisord runs both processes with minimal privileges | Verify process configuration                    |

---

## 15. Local-Tool Control Surface

> **Scope:** Applies to local-only / loopback-bound / single-user tools (Class B; see [Applicability & Scope](#applicability--scope)). For these deployments the auth/RBAC/CSRF/MFA/workspace/OAuth sections are N/A and the controls below are the primary security surface. Skip this section for full multi-user (Class A) apps where the standard auth sections govern instead.
>
> Auth-boundary, outbound-SSRF, and secret-scrubbing verification for aidd-class (Class B) targets is DELEGATED to PROXY_AUTH_BOUNDARY.md, OUTBOUND_SSRF.md, and SECRET_HANDLING_RETENTION.md; do not score those dimensions from this file's defaults or the code's own comments; open the named guard files.

Score **only** the two genuinely SECURITY-unique local rows below. The bearer-token / remote-bind / WS-upgrade-token / remote-origin-guard boundary is now owned by **PROXY_AUTH_BOUNDARY.md**; scoring it here reproduces the exact 88/100 false-pass that audit was created to stop, so those rows are hard pointers, not checks.

| Check     | Criteria                                                                                                                           | Remediation                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]`     | Startup self-test probes public interfaces and aborts if the port is externally reachable when `allowRemote=false`                 | Verify the loopback self-test runs on boot and fails closed                                                                                     |
| `[ ]`     | Path-containment helpers are OS case/separator safe (no Windows allowed-root bypass)                                               | Verify allowed-root checks normalize case and separators on Windows                                                                             |
| DELEGATED | Loopback / remote-bind default, `web.authToken` requirement on remote bind, WS-upgrade query-token acceptance, remote-origin guard | **Do not score here.** Owned by [PROXY_AUTH_BOUNDARY.md](./PROXY_AUTH_BOUNDARY.md); open `bearerTokenGuard.ts` and trace the forwarded request. |

---

## 16. Agent-Orchestration Control Surface (delegated)

> **Scope:** Applies to agent-orchestration targets (aidd), which run an LLM agent's `bash`/file tools with the operator's own OS privileges and drive concurrent managed runs. aidd is the primary dogfood target for this audit, yet these dimensions have **no checklist surface in Sections 1-15**; they are fully owned by the sibling audits below. **Do not score these rows here; open the named guard file and trace the enforcing implementation.**

| Check     | Dimension                                                                                               | Owner                                                        |
| --------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| DELEGATED | Agent `bash`/file-tool sandbox: workspace-path boundary and target-repo prompt-injection                | [AGENT_TOOL_SANDBOX.md](./AGENT_TOOL_SANDBOX.md)             |
| DELEGATED | Git-destructive operations + metadata-only write boundary in target repos                               | [GIT_DESTRUCTIVE_SAFETY.md](./GIT_DESTRUCTIVE_SAFETY.md)     |
| DELEGATED | Director cycle state machine: double-spawn, lost transitions, orphaned runs, TOCTOU concurrency windows | [ORCHESTRATOR_CONCURRENCY.md](./ORCHESTRATOR_CONCURRENCY.md) |

---

## Audit Checklist

### Critical Security Checks

- [ ] Every mutation endpoint has requireAuth or apiKey guard
- [ ] JWT uses ES256 with HTTP-only cookies
- [ ] Token blacklist populated on logout and cleaned up on schedule
- [ ] No `.env` files anywhere; JSON-only config
- [ ] No `process.env` usage outside `configLoader.ts`
- [ ] No hardcoded secrets in code or logs
- [ ] TypeBox validation on all route inputs
- [ ] Drizzle ORM for all queries (no raw SQL concatenation)
- [ ] CSRF protection active on state-changing endpoints
- [ ] No auth tokens in localStorage/sessionStorage
- [ ] Security tables (token_blacklist, password_history, rate_limit_entries) use hard delete
- [ ] Child processes spawned with minimal environment (no `{ ...process.env }` spread)
- [ ] Webhook HMAC verification uses raw request body bytes

### High Priority Checks

- [ ] `requireRoleFresh` validates role from database (not cached)
- [ ] Workspace isolation via `workspaceAccess` guard
- [ ] Password expiry, minimum age, and history enforcement
- [ ] Account lockout on failed login attempts
- [ ] API key HMAC-SHA256 signing with nonce replay protection is mandatory for all API-key requests
- [ ] WebSocket JWT re-validation every 2 minutes
- [ ] pino log redaction covers all sensitive fields
- [ ] CSP headers configured (style-src 'unsafe-inline' documented as Radix requirement)
- [ ] CORS restricted to known origins
- [ ] Rate limiting on auth and global endpoints
- [ ] Password hashing via `Bun.password.hash` (`{ algorithm: 'bcrypt' }`) with configurable rounds (no third-party bcrypt package)
- [ ] Frontend ProtectedRoute mirrors backend guard requirements
- [ ] File uploads subject to magic-byte + extension + MIME cross-check
- [ ] Transport security headers present (Permissions-Policy, Referrer-Policy, HSTS)
- [ ] PostgreSQL connection uses SSL when dialect is postgres (not sqlite)
- [ ] Config validator blocks production startup on security invariant violations

### Medium Priority Checks

- [ ] OAuth provider token validation
- [ ] OAuth PKCE S256 + signed state + session-binding cookie
- [ ] SMTP credentials encrypted in database settings
- [ ] Backup encryption uses AES-256-GCM with HKDF
- [ ] OpenAPI docs disabled in production
- [ ] No `dangerouslySetInnerHTML` without sanitization
- [ ] Audit trail covers all user actions
- [ ] Failed login attempts logged
- [ ] Security events (lockout, password change, role change) logged
- [ ] Self-role-elevation prevented
- [ ] No `eval()` or `Function()` constructor
- [ ] TOTP secrets and backup codes encrypted at rest
- [ ] Backup-code comparison uses constant-time equality
- [ ] MFA challenge-token key pair is dedicated (not reused for session JWTs)
- [ ] Cross-origin isolation headers (COOP/CORP/COEP) configured
- [ ] JWT and encryption key rotation procedures documented
- [ ] Object property-level authorization: no sensitive fields in API responses

### Low Priority Checks

- [ ] X-Request-ID and X-Session-ID correlation headers in requests
- [ ] OAuth callback URLs validated against allowlist
- [ ] Dependencies regularly updated (no known CVEs)
- [ ] `bun run check-deps` passes
- [ ] Webhook URL SSRF allowlist blocks private/loopback IPs
- [ ] Download MIME coercion to `application/octet-stream` for uploads
- [ ] Container runs as non-root, backend port not exposed externally (Docker deployments only)
- [ ] API inventory management: no shadow endpoints
- [ ] (Local-tool / Class B) Loopback bind default, remote bind requires `web.authToken`, query token only on WS upgrade, OS-safe path containment

---

## Report Template

```markdown
# Security Audit Report - YYYY-MM-DD

## Executive Summary

**Application**: {app-name}
**Overall Score**: [Score]/100
**Risk Level**: [LOW/MEDIUM/HIGH/CRITICAL]
**Critical Issues Found**: [Count]
**High Priority Issues Found**: [Count]

## Security Architecture Assessment

- Authentication model: [JWT ES256 / Other]
- Guard coverage: [Percentage]% of endpoints protected
- CSRF protection: [Active/Missing/Partial]
- Token blacklist: [Functional/Missing]
- Password policy: [Complete/Partial/Missing]

## Category Breakdown

> **Scoring guidance:** Total score is out of 100. Per-category weights below are defaults - auditors may rebalance within ±5 points per category based on applicability and depth of findings for a given application (e.g., a file-upload-heavy app may deserve more weight on File Upload Security; an app with no MFA may deserve less on MFA/TOTP). Document any re-weighting at the top of this section. Category totals must still sum to 100.

### 1. Authentication & Session Security - [Score]/15

| Finding       | Severity | Location    | Remediation |
| ------------- | -------- | ----------- | ----------- |
| {Description} | {Level}  | {File:Line} | {Fix}       |

### 2. Authorization & Access Control - [Score]/15

{Findings table}

### 3. Input Validation & Injection Prevention - [Score]/15

{Findings table}

### 4. Data Protection & Encryption - [Score]/10

{Findings table}

### 5. API & Network Security - [Score]/10

{Findings table}

### 6. File Upload Security - [Score]/10

{Findings table}

### 7. MFA/TOTP Security - [Score]/10

{Findings table}

### 8. OWASP Top 10 Compliance - [Score]/15

| OWASP Category                | Status              | Notes   |
| ----------------------------- | ------------------- | ------- |
| A01 Broken Access Control     | [Pass/Partial/Fail] | {Notes} |
| A02 Cryptographic Failures    | [Pass/Partial/Fail] | {Notes} |
| A03 Injection                 | [Pass/Partial/Fail] | {Notes} |
| A04 Insecure Design           | [Pass/Partial/Fail] | {Notes} |
| A05 Security Misconfiguration | [Pass/Partial/Fail] | {Notes} |
| A06 Vulnerable Components     | [Pass/Partial/Fail] | {Notes} |
| A07 Authentication Failures   | [Pass/Partial/Fail] | {Notes} |
| A08 Software/Data Integrity   | [Pass/Partial/Fail] | {Notes} |
| A09 Logging Failures          | [Pass/Partial/Fail] | {Notes} |
| A10 SSRF                      | [Pass/Partial/Fail] | {Notes} |

### 9. Container Security - [Score]/5

{Findings table}

### 10. Local-Tool / Delegated Surface - [Score]/0 (Class A) · scored variant for Class B

This category captures the local-tool and agent-orchestration surface (Sections 15-16) that the nine Class-A categories above do **not** cover - the structural gap that let a Class B target score 88/100 while its real attack surface (auth boundary, outbound SSRF, secret handling, agent sandbox, git-destructive ops, orchestrator concurrency) went unscored.

- **Class A (full multi-user app):** weight **0** - the nine categories above already govern the full multi-user surface; this row is informational only and is not added to the Class-A total.
- **Class B (local-tool / agent-orchestration target):** the substantive score lives in the delegated sibling reports - [PROXY_AUTH_BOUNDARY](./PROXY_AUTH_BOUNDARY.md), [OUTBOUND_SSRF](./OUTBOUND_SSRF.md), [SECRET_HANDLING_RETENTION](./SECRET_HANDLING_RETENTION.md), [AGENT_TOOL_SANDBOX](./AGENT_TOOL_SANDBOX.md), [GIT_DESTRUCTIVE_SAFETY](./GIT_DESTRUCTIVE_SAFETY.md), [ORCHESTRATOR_CONCURRENCY](./ORCHESTRATOR_CONCURRENCY.md). **Reference those scores here; do not re-derive or double-count them in this file's total.** The only rows scored locally for Class B are the two SECURITY-unique §15 rows (loopback self-test fail-closed, OS-safe path containment).

{Findings table - for Class B, cite the delegated-sibling report and its score per dimension}

## Critical Findings 🚨

### {Finding Title}

- **Severity**: Critical
- **Location**: `path/to/file.ts:line`
- **Impact**: {Description}
- **Remediation**: {Steps}
- **Effort**: {Hours/Days}

## False Positives Considered and Rejected

Record every candidate pattern that looked like a finding but was intentionally rejected, with the rationale. This section is REQUIRED - if you found zero false-positive candidates, state that explicitly. Common candidates to document (if encountered): `dangerouslySetInnerHTML` in MFA QR rendering, `style-src 'unsafe-inline'` for Radix UI, health endpoint metadata exposure, refresh / logout CSRF exemption decisions, SameSite=Strict vs Lax choices.

| Candidate                                            | Disposition                                                                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| {Description of the flagged pattern, with path:line} | **Not a finding.** {Rationale - reference documented trade-off, framework behavior, or defense-in-depth layer that compensates.} |

## Recommendations

### Immediate (0-24 hours)

1. {Critical security fixes}

### Short-term (1-7 days)

1. {High priority improvements}

### Long-term (1-3 months)

1. {Architectural improvements}
```

## Deliverables

### Required Outputs

1. Security audit report in `.aidd/audit-reports/SECURITY-YYYY-MM-DD.md`
2. Feature.json files for each finding requiring code changes
3. OWASP Top 10 compliance matrix (pass/partial/fail)
4. Dependency vulnerability scan results

### Success Criteria

- [ ] 0 unguarded mutation endpoints
- [ ] 0 hardcoded secrets
- [ ] 0 `.env` files
- [ ] 100% TypeBox validation on route inputs
- [ ] Token blacklist functional
- [ ] CSRF protection active
- [ ] All OWASP Top 10 categories assessed
- [ ] pino redaction covers all sensitive fields

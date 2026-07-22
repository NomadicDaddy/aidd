# Pode Guidelines

This guide documents production Pode patterns for PowerShell web services. It is an opinionated
convention set, not a generic Pode tutorial.

Examples use `App` as the module noun prefix (`Get-AppConfig`, `Assert-AppEnv`), `APP_` as the
environment-variable prefix, and `app.psm1` / `config/app.json` as the shared module and config.
Substitute your own service's prefix and filenames throughout — the patterns, not the names, are
the point. Helpers such as `New-ApiContext`, `Send-ApiResponse`, and `Write-FormattedLog` are
likewise conventions you implement in your shared module; they are not provided by Pode.

## Contents

- [Architecture](#architecture-overview)
- [Server setup](#server-setup)
- [Environment variables](#environment-variables)
- [Authentication](#authentication)
- [Routes](#route-structure)
- [Errors](#error-handling)
- [Rate limiting](#rate-limiting)
- [Logging](#logging)
- [OpenAPI](#openapi-documentation)
- [Scheduled tasks](#scheduled-tasks-core-service)
- [Security headers](#security-headers)
- [Middleware](#middleware)
- [Shared modules](#shared-module-functions)
- [Testing](#testing)
- [Common patterns](#common-patterns)

## Architecture Overview

These patterns assume a **dual-service architecture**:

| Service  | Port | Purpose                                            | Access                    |
| -------- | ---- | -------------------------------------------------- | ------------------------- |
| **API**  | 8572 | Public HTTP interface, JWT auth, OpenAPI docs      | External clients          |
| **Core** | 8571 | Background collectors, work queue, scheduled tasks | Internal only (127.0.0.1) |

Both services share the `app.psm1` module for common functionality.

## Server Setup

> **Pode version**: Target **2.13.4**. The `MinimumVersion 2.12.1 -MaximumVersion 2.99.99` pin below
> resolves within the supported 2.x line, which preserves the auth, OpenAPI, session, logging,
> schedule, and rate-limit cmdlets used in this guide. The `-MaximumVersion 2.99.99` ceiling guards
> against a future breaking major.

### Module Import Strategy

Pode runs route handlers in separate runspaces that don't inherit parent module imports. The pattern:

```powershell
# BEFORE Start-PodeServer: Import for initial setup
Import-Module -Name 'Pode' -MinimumVersion 2.12.1 -MaximumVersion 2.99.99 -Force
Import-Module -Name 'PSSQLite' -MinimumVersion 1.1.0 -MaximumVersion 1.99.99 -Force

$sharedModulePath = Join-Path $repoRoot 'app\app.psm1'
Import-Module -Name $sharedModulePath -ErrorAction Stop -Force

# Validate environment before starting
try { Assert-AppEnv -Service 'API' } catch { Write-Host $_ -ForegroundColor Red; exit 1 }

# Capture paths BEFORE entering ScriptBlock (where $MyInvocation is unavailable)
$repoRootForPode = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

Start-PodeServer -Name 'API' -ScriptBlock {
    # DO NOT re-import Pode or app.psm1 in API service
    # The module is already loaded and re-importing breaks $PodeContext

    # For Core service (separate process), re-import IS required:
    # Import-Module -Name $sharedModulePath -ErrorAction Stop -Force
}
```

### Endpoint Configuration

Use the shared helper for consistent endpoint setup:

```powershell
$protocol = if ($env:APP_HTTPS_ENABLED -match '^(1|true|yes)$') { 'https' } else { 'http' }

Add-AppEndpoints -Service 'API' `
    -HttpUrl $env:APP_HTTP_URL `
    -Port ([int]$env:APP_API_PORT) `
    -Protocol $protocol `
    -CertThumbprint $env:APP_CERT_THUMBPRINT
```

### Edition-Based SSL Enforcement

Enterprise edition requires HTTPS:

```powershell
$edition = Get-AppEdition
if ($edition -eq 'Enterprise') {
    if (-not ($env:APP_HTTPS_ENABLED -match '^(1|true|yes)$')) {
        throw 'Enterprise edition requires SSL. Set APP_HTTPS_ENABLED=true'
    }
    if (-not $env:APP_CERT_THUMBPRINT) {
        throw 'Enterprise edition requires SSL certificate. Set APP_CERT_THUMBPRINT'
    }
}
```

## Environment Variables

All configuration flows through environment variables (set by `Assert-AppEnv` from `config/app.json`):

| Variable                 | Purpose                           |
| ------------------------ | --------------------------------- |
| `APP_HTTP_URL`           | Bind address (e.g., `127.0.0.1`)  |
| `APP_API_PORT`           | API service port (default: 8572)  |
| `APP_CORE_PORT`          | Core service port (default: 8571) |
| `APP_JWT_SECRET`         | JWT signing secret                |
| `APP_JWT_REFRESH_SECRET` | Refresh token secret              |
| `APP_HTTPS_ENABLED`      | Enable HTTPS (`true`/`false`)     |
| `APP_CERT_THUMBPRINT`    | SSL certificate thumbprint        |
| `APP_DB_FILE`            | SQLite database path              |
| `APP_DEBUG`              | Enable debug logging              |

## Authentication

### JWT Bearer Authentication

```powershell
# Configure JWT authentication scheme
New-PodeAuthScheme -Bearer -AsJWT -Secret $env:APP_JWT_SECRET | Add-PodeAuth -Name 'JWT' -ScriptBlock {
    param($payload)

    $now = [System.DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

    # Verify required claims
    if ([string]::IsNullOrEmpty($payload.sub) -or
        [string]::IsNullOrEmpty($payload.iss) -or
        [string]::IsNullOrEmpty($payload.aud)) {
        return $false
    }

    # Verify issuer and audience
    if (-not ($payload.iss -ieq 'app-api') -or -not ($payload.aud -ieq 'app-client')) {
        return $false
    }

    # Verify expiration with 30-second grace period for clock skew
    $gracePeriod = 30
    if ($payload.exp -lt ($now - $gracePeriod)) { return $false }
    if ($payload.nbf -and $payload.nbf -gt ($now + $gracePeriod)) { return $false }

    # Return user context
    return @{
        User = @{
            Username = $payload.username ?? $payload.sub
            Roles = @($payload.role ?? 'user')
        }
    }
}
```

### Token Generation (Login Flow)

```powershell
$header = @{ alg = 'HS256'; typ = 'JWT' }
$now = [System.DateTimeOffset]::Now

$accessPayload = @{
    sub      = $username
    username = $username
    role     = $userRole
    type     = 'access'
    exp      = $now.AddSeconds(3600).ToUnixTimeSeconds()   # 1 hour
    nbf      = $now.AddSeconds(-30).ToUnixTimeSeconds()    # Clock skew tolerance
    iat      = $now.ToUnixTimeSeconds()
    iss      = 'app-api'
    aud      = 'app-client'
    jti      = [guid]::NewGuid().ToString()
}

$refreshPayload = @{
    sub  = $username
    type = 'refresh'
    exp  = $now.AddSeconds(604800).ToUnixTimeSeconds()  # 7 days
    # ... other claims
}

$accessToken = ConvertTo-PodeJwt -Header $header -Payload $accessPayload -Secret $env:APP_JWT_SECRET
$refreshToken = ConvertTo-PodeJwt -Header $header -Payload $refreshPayload -Secret $env:APP_JWT_SECRET

# Set both cookies and return in response body
Set-PodeCookie -Name 'auth_token' -Value $accessToken -HttpOnly -Secure:($protocol -eq 'https')
Set-PodeCookie -Name 'refresh_token' -Value $refreshToken -HttpOnly -Secure:($protocol -eq 'https')
```

### Session Middleware

```powershell
Enable-PodeSessionMiddleware -Duration 120 -Extend `
    -Secret $env:APP_JWT_SECRET `
    -Strict -Name 'pode.sid' `
    -Secure:($protocol -eq 'https')
```

## Route Structure

### File-Based Routing Convention

Routes are organized by path with HTTP method as filename:

```
backend/src/
├── api/
│   ├── auth/
│   │   ├── login/
│   │   │   └── post.ps1      # POST /api/auth/login
│   │   ├── logout/
│   │   │   └── post.ps1      # POST /api/auth/logout
│   │   └── refresh/
│   │       └── post.ps1      # POST /api/auth/refresh
│   ├── servers/
│   │   ├── get.ps1           # GET /api/servers
│   │   ├── post.ps1          # POST /api/servers
│   │   ├── put.ps1           # PUT /api/servers
│   │   └── delete.ps1        # DELETE /api/servers
│   └── health/
│       └── get.ps1           # GET /api/health
```

### Route File Template

Every route file must follow this pattern:

```powershell
# Guard: Only execute when handling a request (not during route registration)
if (-not $WebEvent) { return }

try {
    # Create standardized API context
    $context = New-ApiContext -WebEvent $WebEvent

    # Log the request
    Write-FormattedLog -tag 'api' -log "$($context.Api): $($context.Method) $($context.Path)"

    # Rate limiting (optional, for sensitive endpoints)
    $clientIp = $WebEvent.Request.RemoteEndPoint.Address.ToString()
    if (-not (Test-RateLimit -IpAddress $clientIp -Endpoint $context.Path -MaxRequests 10 -WindowSeconds 60)) {
        Send-ApiError -Context $context -StatusCode 429 -ErrorCode 'RATE_LIMIT_EXCEEDED' -Message 'Too many requests'
        return
    }

    # Business logic here
    $data = $context.Data  # Parsed JSON body

    # Success response
    Send-ApiResponse -Context $context -Data @{ result = 'success' } -StatusCode 200

} catch {
    Write-FormattedLog -tag 'error' -log "Error: $_"
    Send-ApiError -Context $context -StatusCode 500 -ErrorCode 'INTERNAL_ERROR' -Message 'An unexpected error occurred'
}
```

### Dynamic Route Registration

Routes are auto-discovered and registered with OpenAPI metadata:

```powershell
$apiRoot = Join-Path $PSScriptRoot 'src'
$allFiles = Get-ChildItem -Path $apiRoot -Filter *.ps1 -Recurse -File

foreach ($file in $allFiles) {
    $method = switch ($file.BaseName.ToLower()) {
        'get' { 'Get' }
        'post' { 'Post' }
        'put' { 'Put' }
        'delete' { 'Delete' }
        'patch' { 'Patch' }
        default { 'Post' }
    }

    # Convert file path to API path
    $apiPath = '/' + ($rel -replace '\.ps1$', '' -replace "/$method$", '')

    # Determine if route requires authentication
    $requiresAuth = $apiPath -notmatch '^/api/(health|auth)'

    # Register with OpenAPI
    $route = Register-RouteWithOpenApi -ApiPath $apiPath -Method $method -FilePath $file.FullName -RequiresAuth $requiresAuth
}
```

### Public vs Protected Routes

```powershell
$PublicRoutes = @(
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/refresh',
    '/api/auth/register',
    '/api/health',
    '/api/metrics/*',
    '/docs/*'
)

# Check if route requires auth
$requiresAuth = $true
foreach ($route in $PublicRoutes) {
    if ($route.EndsWith('*')) {
        if ($apiPath -like "$($route.TrimEnd('*'))*") { $requiresAuth = $false; break }
    } elseif ($apiPath -eq $route) {
        $requiresAuth = $false; break
    }
}
```

## Error Handling

### Standardized Error Responses

Use `Send-ApiError` for consistent error format:

```powershell
Send-ApiError -Context $context `
    -StatusCode 400 `
    -ErrorCode 'MISSING_CREDENTIALS' `
    -Message 'Username and password are required'

Send-ApiError -Context $context `
    -StatusCode 429 `
    -ErrorCode 'RATE_LIMIT_EXCEEDED' `
    -Message 'Too many requests' `
    -Details @{ retry_after = 60 }
```

### Error Code Conventions

| Code                  | Status | Meaning                  |
| --------------------- | ------ | ------------------------ |
| `RATE_LIMIT_EXCEEDED` | 429    | Too many requests        |
| `MISSING_CREDENTIALS` | 400    | Required fields missing  |
| `INVALID_CREDENTIALS` | 401    | Auth failed              |
| `UNAUTHORIZED`        | 401    | No/invalid token         |
| `FORBIDDEN`           | 403    | Insufficient permissions |
| `ACCOUNT_DISABLED`    | 403    | Account suspended        |
| `NOT_FOUND`           | 404    | Resource not found       |
| `DATABASE_ERROR`      | 503    | Database unavailable     |
| `INTERNAL_ERROR`      | 500    | Unexpected error         |

### Exception Handling Pattern

```powershell
try {
    # Business logic
} catch {
    $errorMessage = $_.Exception.Message
    $statusCode = 500
    $errorCode = 'INTERNAL_ERROR'
    $friendlyMessage = 'An unexpected error occurred'

    switch -Wildcard ($errorMessage) {
        '*Database file not found*' {
            $statusCode = 503
            $errorCode = 'DATABASE_ERROR'
            $friendlyMessage = 'Service temporarily unavailable'
        }
        '*Account is disabled*' {
            $statusCode = 403
            $errorCode = 'ACCOUNT_DISABLED'
            $friendlyMessage = 'Account is disabled'
        }
    }

    Send-ApiError -Context $context -StatusCode $statusCode -ErrorCode $errorCode -Message $friendlyMessage
}
```

## Rate Limiting

### IP-Based Limit Rules

```powershell
# Global rate limit (Pode built-in)
Add-PodeLimitRule -Type IP -Values 127.0.0.1 -Limit 1000 -Seconds 1

# Application-level rate limiting (custom)
if (-not (Test-RateLimit -IpAddress $clientIp -Endpoint '/api/auth/login' -MaxRequests 10 -WindowSeconds 60)) {
    Send-ApiError -Context $context -StatusCode 429 -ErrorCode 'RATE_LIMIT_EXCEEDED' -Message 'Too many attempts'
    return
}
```

## Logging

### File-Based Logging Configuration

```powershell
$logPath = Join-Path $repoRoot 'logs'

# Ensure log directory exists
if (-not (Test-Path -Path $logPath)) {
    New-Item -Path $logPath -ItemType Directory -Force | Out-Null
}

# Configure Pode request/error logging with rotation
New-PodeLoggingMethod -File -Path $logPath -Name 'api-requests' -MaxSize 25MB -Batch 1 -BatchTimeout 15 | Enable-PodeRequestLogging
New-PodeLoggingMethod -File -Path $logPath -Name 'api-errors' -MaxSize 25MB | Enable-PodeErrorLogging

# Set default for custom logging
$PSDefaultParameterValues['Write-FormattedLog:logfile'] = (Join-Path $logPath 'api.log')
```

### Semantic Log Tags

Use `Write-FormattedLog` with semantic tags:

```powershell
Write-FormattedLog -tag 'api' -log "GET /api/servers"
Write-FormattedLog -tag 'auth' -log "JWT authentication configured"
Write-FormattedLog -tag 'debug' -log "Resolved DB path: $dbPath"
Write-FormattedLog -tag 'warning' -log "Failed to determine edition"
Write-FormattedLog -tag 'error' -log "Database connection failed: $_"
Write-FormattedLog -tag 'cron' -log "Collector completed: $collectorName"
Write-FormattedLog -tag 'queue' -log "Work item processed: id=$id"
```

### Log File Naming

```
logs/
├── api.log                           # API service application log
├── core.log                          # Core service application log
├── api-requests_2024-12-01_001.log   # Daily request logs (rotated)
├── api-errors_2024-12-01_001.log     # Daily error logs (rotated)
├── core-requests_2024-12-01_001.log
└── core-errors_2024-12-01_001.log
```

## OpenAPI Documentation

### Enabling OpenAPI

```powershell
# Enable OpenAPI early (before route registration)
Enable-PodeOA -Path '/docs/openapi/v3.0' -RouteFilter '/api/*' `
    -OpenApiVersion '3.0.3' `
    -EnableSchemaValidation:($PSVersionTable.PSEdition -eq 'Core') `
    -DisableMinimalDefinitions -NoDefaultResponses `
    -DefinitionTag 'v3.0'

Enable-PodeOA -Path '/docs/openapi/v3.1' -RouteFilter '/api/*' `
    -OpenApiVersion '3.1.0' `
    -EnableSchemaValidation:($PSVersionTable.PSEdition -eq 'Core') `
    -DisableMinimalDefinitions -NoDefaultResponses `
    -DefinitionTag 'v3.1'
```

### Registering Routes with OpenAPI Metadata

```powershell
function Register-RouteWithOpenApi {
    param(
        [string]$ApiPath,
        [string]$FilePath,
        [string]$Method,
        [bool]$RequiresAuth
    )

    $rp = @{ Path = $ApiPath; Method = $Method; FilePath = $FilePath; IfExists = 'Skip' }
    if ($RequiresAuth) { $rp['Authentication'] = 'JWT' }

    $route = Add-PodeRoute @rp -PassThru

    $tag = Get-AppOpenApiTag -Path $ApiPath
    $opId = Get-AppOperationId -Path $ApiPath -Method $Method

    $route = $route |
        Set-PodeOARouteInfo -DefinitionTag 'v3.0', 'v3.1' `
            -Summary "$Method $ApiPath" `
            -Description "Endpoint $ApiPath" `
            -Tags $tag -OperationId $opId -PassThru

    # Add standard error responses
    $route |
        Add-PodeOAResponse -DefinitionTag 'v3.0', 'v3.1' -StatusCode 200 -Description 'Success' -PassThru |
        Add-PodeOAResponse -DefinitionTag 'v3.0', 'v3.1' -StatusCode 401 -Description 'Unauthorized' -PassThru |
        Add-PodeOAResponse -DefinitionTag 'v3.0', 'v3.1' -StatusCode 429 -Description 'Rate limit exceeded' | Out-Null

    return $route
}
```

### Component Schemas

```powershell
Select-PodeOADefinition -Tag 'v3.0', 'v3.1' -ScriptBlock {
    # Request/Response schemas
    Add-PodeOAComponentSchema -Name 'LoginRequest' -Component (
        New-PodeOAObjectProperty -Name 'LoginRequest' -Properties @(
            (New-PodeOAStringProperty -Name 'username' -Required),
            (New-PodeOAStringProperty -Name 'password' -Required -Format Password)
        )
    )

    Add-PodeOAComponentSchema -Name 'ErrorResponse' -Component (
        New-PodeOAObjectProperty -Name 'ErrorResponse' -Properties @(
            (New-PodeOAStringProperty -Name 'error' -Required),
            (New-PodeOAStringProperty -Name 'code' -Required),
            (New-PodeOAIntProperty -Name 'retry_after')
        )
    )

    # Tags
    Add-PodeOATag -Name 'Authentication' -Description 'Authentication endpoints'
    Add-PodeOATag -Name 'Servers' -Description 'Server management endpoints'
}
```

### OpenAPI Viewers

```powershell
$viewers = @(
    @{ Type = 'Swagger'; Path = '/docs/v3.0/swagger'; DarkMode = $true },
    @{ Type = 'ReDoc'; Path = '/docs/v3.0/redoc' },
    @{ Type = 'RapiDoc'; Path = '/docs/v3.0/rapidoc'; DarkMode = $true },
    @{ Type = 'StopLight'; Path = '/docs/v3.0/stoplight' },
    @{ Type = 'Explorer'; Path = '/docs/v3.0/explorer' }
)

foreach ($viewer in $viewers) {
    Enable-PodeOAViewer @viewer -OpenApiUrl '/docs/openapi/v3.0' -DefinitionTag 'v3.0'
}

Enable-PodeOAViewer -Editor -Path '/docs/v3.0/swagger-editor' -OpenApiUrl '/docs/openapi/v3.0' -DefinitionTag 'v3.0'
```

## Scheduled Tasks (Core Service)

### Schedule Configuration

Schedules are defined in `config/schedules.json`:

```json
{
	"collectors": {
		"database-stats": "0 * * * *",
		"server-metrics": "*/5 * * * *"
	},
	"groups": {
		"performance": "*/15 * * * *",
		"security": "0 */6 * * *"
	}
}
```

### Dynamic Schedule Registration

```powershell
$schedulesPath = Join-Path $repoRoot 'config\schedules.json'
$schedules = Get-Content -Path $schedulesPath | ConvertFrom-Json

$collectorsPath = Join-Path $PSScriptRoot 'collectors'
$collectorFiles = Get-ChildItem -Path $collectorsPath -Recurse -Filter *.ps1

foreach ($collectorFile in $collectorFiles) {
    $collectorName = $collectorFile.BaseName
    $collectorGroup = $collectorFile.Directory.Name

    # Determine cron: specific collector > group default > hourly fallback
    $cron = '0 * * * *'
    if ($schedules.collectors.$collectorName) {
        $cron = $schedules.collectors.$collectorName
    } elseif ($schedules.groups.$collectorGroup) {
        $cron = $schedules.groups.$collectorGroup
    }

    Add-PodeSchedule -Name $collectorName -Cron $cron -ScriptBlock {
        # Re-import module in schedule's runspace
        Import-Module -Name (Join-Path $PSScriptRoot '..\app\app.psm1') -Force

        # Graceful shutdown check
        if ($env:APP_SHUTTING_DOWN -match '^(1|true|yes)$') {
            Write-FormattedLog -tag 'cron' -log "skip: stopping; collector=$using:collectorName"
            return
        }

        # Busy policy gating
        $check = Test-RunningJob -JobType $using:collectorName -ServerId 'core' -MaxConcurrent 1
        if (-not $check.CanRun) {
            Write-FormattedLog -tag 'cron' -log "queued: collector=$using:collectorName"
            return
        }

        # Job tracking
        $job = Start-JobTracking -ServerId 'core' -ServerName 'CoreService' -Scope $using:collectorName
        Update-JobStatus -JobId $job.JobId -Status 'running'

        try {
            Assert-AppNotCancelled -JobId $job.JobId
            Start-App -CollectorName $using:collectorName
            Update-JobStatus -JobId $job.JobId -Status 'completed'
        } catch [System.OperationCanceledException] {
            Update-JobStatus -JobId $job.JobId -Status 'cancelled' -Error $_.Exception.Message
        } catch {
            Update-JobStatus -JobId $job.JobId -Status 'failed' -Error $_.Exception.Message
            throw
        }
    }
}
```

### Work Queue Poller

For API-triggered async tasks:

```powershell
Add-PodeSchedule -Name 'work-queue-poller' -Cron '*/1 * * * *' -ScriptBlock {
    Import-Module -Name (Join-Path $PSScriptRoot '..\app\app.psm1') -Force

    if ($env:APP_SHUTTING_DOWN -match '^(1|true|yes)$') { return }

    $batchSize = [int]($env:APP_WORKQUEUE_BATCH ?? 5)

    for ($i = 0; $i -lt $batchSize; $i++) {
        $workItem = Get-WorkQueueItem -WorkerId $using:workerId
        if (-not $workItem) { break }

        try {
            switch ($workItem.JobType.ToLower()) {
                'collector' { Start-App -CollectorName $workItem.Payload.collectorName }
                'scan' { Start-App -ScanType $workItem.Payload.scanType }
            }
            Complete-WorkQueueItem -Id $workItem.Id -Status 'completed'
        } catch {
            Complete-WorkQueueItem -Id $workItem.Id -Status 'failed' -Error $_.Exception.Message
        }
    }
}
```

## Security Headers

Set security headers on sensitive responses:

```powershell
Set-PodeHeader -Name 'X-Content-Type-Options' -Value 'nosniff'
Set-PodeHeader -Name 'X-Frame-Options' -Value 'DENY'
Set-PodeHeader -Name 'X-XSS-Protection' -Value '1; mode=block'
Set-PodeHeader -Name 'Referrer-Policy' -Value 'strict-origin-when-cross-origin'
Set-PodeHeader -Name 'Cache-Control' -Value 'no-store, no-cache, must-revalidate, proxy-revalidate'
Set-PodeHeader -Name 'Pragma' -Value 'no-cache'
```

## Middleware

### Pode Bug Workaround

Fix for null `Route.FilePath` when registering routes via `-ScriptBlock`:

```powershell
Add-PodeMiddleware -Name '__fix_route_filepath__' -ScriptBlock {
    try {
        if ($null -eq $WebEvent.Route.FilePath -or [string]::IsNullOrWhiteSpace($WebEvent.Route.FilePath)) {
            $WebEvent.Route.FilePath = $WebEvent.Route.Path
        }
    } catch { }
}
```

### Security Initialization

```powershell
Initialize-AppSecurity -Protocol $protocol -HttpUrl $env:APP_HTTP_URL -HttpsEnabled ($protocol -eq 'https')
Set-AppDevAccessRules
```

## Shared Module Functions

Key functions from `app.psm1`:

| Function                 | Purpose                                   |
| ------------------------ | ----------------------------------------- |
| `Get-AppConfig`          | Load configuration from `config/app.json` |
| `Get-AppEdition`         | Determine Free/Enterprise edition         |
| `Get-AppAuthProfile`     | Get auth mode (Local/Enterprise)          |
| `Assert-AppEnv`          | Validate and set environment variables    |
| `New-ApiContext`         | Create standardized request context       |
| `Send-ApiResponse`       | Send success JSON response                |
| `Send-ApiError`          | Send error JSON response                  |
| `Write-FormattedLog`     | Structured logging with tags              |
| `Test-RateLimit`         | Application-level rate limiting           |
| `Start-JobTracking`      | Begin job observability                   |
| `Update-JobStatus`       | Update job progress                       |
| `Assert-AppNotCancelled` | Check for graceful cancellation           |
| `Initialize-AppSecurity` | Configure CORS, CSP, etc.                 |

## Testing

```powershell
# Unit tests (Pester)
Invoke-Pester -Path ./tests/unit

# Integration tests
Invoke-Pester -Path ./tests/integration

# Smoke test (lint + typecheck + format)
bun run smoke:qc
```

## Common Patterns

### Database Operations

```powershell
# Get connection based on edition
$dbType = (Get-AppConfig).App.DatabaseType

if ($dbType -eq 'SQLite') {
    $result = Invoke-SqliteQuery -DataSource $env:APP_DB_FILE -Query $sql
} else {
    $result = Invoke-SqlCmd2 -ServerInstance $env:APP_MSSQL_INSTANCE -Database $env:APP_MSSQL_DATABASE -Query $sql
}
```

### Graceful Shutdown

```powershell
# Check before starting work
if ($env:APP_SHUTTING_DOWN -match '^(1|true|yes)$') {
    Write-FormattedLog -tag 'cron' -log "skip: service stopping"
    return
}

# During long operations
Assert-AppNotCancelled -JobId $jobId -Message "Aborting due to shutdown"
```

## References

Pode framework sources. As noted above, the `App`-prefixed helpers
(`New-ApiContext`, `Send-ApiResponse`, `Write-FormattedLog`, etc.) are conventions of your own
shared module, not Pode APIs:

- Pode documentation: <https://badgerati.github.io/Pode/>
- Pode release notes: <https://badgerati.github.io/Pode/release-notes/>
- Pode on GitHub: <https://github.com/Badgerati/Pode>
- Pode on the PowerShell Gallery: <https://www.powershellgallery.com/packages/Pode>
- Related skill (shell/language rules): `powershell-guidelines`

# PowerShell Guidelines

> **Environment mandate**: PowerShell 7+ (`pwsh`) only. Never use `powershell.exe` / Windows PowerShell 5.1.
>
> **Version baseline**: Target **PowerShell 7.6.3 (LTS)** on .NET 10 LTS. The previous LTS,
> **7.4**, reaches end of support around **2026-11-10**, so migrate off it. 7.5 is a stable non-LTS
> branch; 7.7 is preview-only. `Set-StrictMode -Version 3.0` remains the highest concrete strictness
> level; values above 3.0 and `Latest` currently map to 3.0 behavior.

Apply these practices to PowerShell 7.x scripts and modules. Each guideline includes a concise
rationale and source attribution where applicable.

The general practices draw from three source groups:

- **Cmdlet Development Guidelines**: Drawn from Microsoft's Strongly Encouraged Development Guidelines.
- **Style Guide**: Drawn from PoshCode's PowerShell Practice and Style Guide (Introduction).
- **Best Practices**: Drawn from PoshCode's Best Practices (Introduction).

Prioritize the strongly encouraged and core recommendations. Consult the original sources for
additional detail.

## Contents

- [Core guidelines](#core-guidelines)
- [Spernakit and Pode](#spernakit-and-pode-backend-guidelines)
- [Quick reference](#quick-reference)
- [Additional notes](#additional-notes)
- [References](#references)

## Core Guidelines

### 1. Cmdlet Development Guidelines (Microsoft)

These focus on creating robust, user-friendly cmdlets and modules in PowerShell 7.x, emphasizing consistency with built-in cmdlets.

- **Use Approved Verbs**: Always select from the official list of approved verbs (e.g., `Get-`, `Set-`, `New-`) to name cmdlets. Rationale: Ensures predictability and discoverability. Example: Use `Get-Process` instead of `Fetch-Process`.
- **Support ShouldProcess for Potentially Destructive Actions**: Implement `ShouldProcess` (with `-WhatIf` and `-Confirm`) for cmdlets that modify systems or data. Rationale: Allows users to preview changes safely.
- **Output Objects, Not Formatted Text**: Return .NET objects from cmdlets rather than formatted strings. Rationale: Enables piping and further processing in the pipeline.
- **Handle Pipeline Input Properly**: Design parameters to accept input from the pipeline by value or property name. Rationale: Enhances composability in scripts.
- **Use Parameter Validation Attributes**: Apply attributes like `[ValidateNotNullOrEmpty()]` or `[ValidateSet()]` to parameters. Rationale: Prevents invalid input and provides better error messages.
- **Implement Error Handling with Write-Error**: Use `Write-Error` for non-terminating errors and throw exceptions for terminating ones. Rationale: Maintains script flow while informing users.
- **Support Common Parameters**: Ensure cmdlets inherit from `PSCmdlet` or `Cmdlet` to automatically support parameters like `-Verbose`, `-Debug`, etc. Rationale: Aligns with PowerShell's standard behavior.
- **Avoid Overloading Cmdlets**: Keep cmdlet functionality focused; use separate cmdlets for distinct operations. Rationale: Reduces complexity and improves usability.
- **Document with Comment-Based Help**: Include `.<SYNOPSIS>`, `.<DESCRIPTION>`, etc., in comment blocks. Rationale: Enables `Get-Help` integration.
- **Always Use CmdletBinding**: Every function intended for reuse MUST include `[CmdletBinding()]` attribute. Rationale: Enables common parameters (-Verbose, -Debug, -ErrorAction) and proper pipeline behavior.

(Source: <https://learn.microsoft.com/en-us/powershell/scripting/developer/cmdlet/strongly-encouraged-development-guidelines?view=powershell-7.6>)

### 2. Style Guide (PoshCode)

These emphasize readable, maintainable code styling for PowerShell scripts, aligning with community conventions for PowerShell 7.x.

- **Use Consistent Indentation and Spacing**: Indent with 4 spaces (no tabs) and add spaces around operators (e.g., `$x = 5`). Rationale: Improves readability; follow a style similar to Allman or K&R for braces.
- **Name Variables Descriptively**: Use camelCase for variables (e.g., `$userName`) and avoid single-letter names except in simple loops. Rationale: Enhances code self-documentation.
- **Format Functions with Proper Structure**: Define functions with `function Verb-Noun { ... }`, including param blocks and begin/process/end blocks where needed. Rationale: Matches cmdlet patterns for consistency.
- **Use Single Quotes for Literal Strings**: Prefer single quotes (`'text'`) unless variable expansion is required (then use double quotes). Rationale: Avoids unintended interpolation.
- **Break Long Lines at 80-120 Characters**: Wrap lines logically, using backticks (`) sparingly for continuation. Rationale: Improves readability on various displays.
- **Comment Liberally but Concisely**: Use `#` for inline comments and `<# ... #>` for block comments. Rationale: Explains intent without overwhelming the code.
- **Avoid Aliases in Scripts**: Use full cmdlet names (e.g., `Get-ChildItem` instead of `gci`) in scripts/modules. Rationale: Ensures portability and clarity.
- **Organize Code into Sections**: Group related code with regions (e.g., `#region Variables`) or clear comments. Rationale: Aids navigation in larger scripts.

(Source: <https://github.com/PoshCode/PowerShellPracticeAndStyle/blob/master/Style-Guide/Introduction.md>)

### 3. Best Practices (PoshCode)

These cover practical, secure, and efficient scripting habits for PowerShell 7.x, focusing on reliability and performance.

- **Write Idempotent Scripts**: Ensure scripts can run multiple times without unintended side effects (e.g., check if a file exists before creating it). Rationale: Prevents errors in automated or repeated executions.
- **Use Strict Mode**: Enable `Set-StrictMode -Version 3.0` at the script start (use version 3.0 for explicit compatibility). Rationale: Catches common errors like undefined variables early.
- **Prefer Try-Catch for Error Handling**: Wrap risky operations in `try { ... } catch { ... }` blocks. Rationale: Provides controlled error recovery over global `$ErrorActionPreference`.
- **Validate Input Early**: Check parameters and inputs at the beginning of functions/scripts. Rationale: Fails fast and provides meaningful feedback.
- **Avoid Global Variables**: Scope variables appropriately (e.g., use `script:` or `local:` prefixes if needed). Rationale: Reduces side effects and improves modularity.
- **Use Modules for Reusability**: Package reusable code into modules with manifests (`.psd1` files). Rationale: Promotes code sharing and versioning in PowerShell 7.x's module system.
- **Cross-Platform Compatibility**: For cross-platform scripts, use `Test-Path` and `[System.IO.Path]::DirectorySeparatorChar`. **Note**: Spernakit with Pode backend targets Windows-only (SQL Server, CIM); cross-platform concerns do not apply.
- **Secure Sensitive Data**: Use `SecureString` for passwords and avoid hardcoding secrets. Rationale: Enhances security, especially in automated environments.
- **Profile Performance**: Use `Measure-Command` to optimize slow operations. Rationale: Leverages PowerShell 7.x's improved speed for efficient scripts.

(Source: <https://github.com/PoshCode/PowerShellPracticeAndStyle/blob/master/Best-Practices/Introduction.md>)

---

## Spernakit + Pode Backend Guidelines

These guidelines are specific to projects using Spernakit with Pode as the backend instead of Express.

### 4. Pode Framework Patterns

Pode is a cross-platform PowerShell web framework used for REST APIs in Spernakit + Pode projects.

#### Route Handler Structure

```powershell
# Guard: Only execute when handling a request (not during route registration)
if (-not $WebEvent) { return }

try {
    # Create standardized API context
    $context = New-ApiContext -WebEvent $WebEvent

    # Log the request
    Write-FormattedLog -tag 'api' -log "$($context.Api): $($context.Method) $($context.Path)"

    # Process request logic here
    $result = Get-SomeData -Id $context.Query.id

    # Return success response
    Send-ApiResponse -Context $context -Data $result
}
catch {
    Send-ApiError -Context $context -StatusCode 500 -ErrorCode 'INTERNAL_ERROR' -Message 'Operation failed' -Details @{ error = $_.Exception.Message }
}
```

#### Key Patterns

- **WebEvent Guard**: Always check `if (-not $WebEvent) { return }` at the start of route handlers. Route files are sourced during registration; the guard prevents execution during that phase.
- **API Context**: Use `New-ApiContext -WebEvent $WebEvent` to create a standardized context object with Method, Path, Query, Body, and Headers.
- **Response Helpers**: Use `Send-ApiResponse` for success and `Send-ApiError` for errors. Never use `Write-PodeJsonResponse` directly in route handlers.
- **Error Codes**: Define consistent error codes (e.g., `AUTH_FAILED`, `NOT_FOUND`, `VALIDATION_ERROR`) for client-side handling.

#### Route Organization

```
backend/
├── src/
│   ├── auth/
│   │   └── token/
│   │       └── post.ps1          # POST /auth/token
│   ├── collect/
│   │   ├── start/
│   │   │   └── post.ps1          # POST /collect/start
│   │   └── status/
│   │       └── get.ps1           # GET /collect/status
│   └── settings/
│       ├── get.ps1               # GET /settings
│       └── put.ps1               # PUT /settings
├── deeper-api.ps1                # API bootstrap
├── launcher.ps1                  # Service launcher
└── server.psd1                   # Pode configuration
```

### 5. Module Organization

Shared functionality should be packaged in a project module with public/private separation.

#### Directory Structure

```
{project}/
├── {project}.psm1                # Main module file
└── cmdlets/
    ├── public/                   # Exported functions
    │   ├── Write-FormattedLog.ps1
    │   ├── Send-ApiResponse.ps1
    │   └── Invoke-OperationalDbQuery.ps1
    └── private/                  # Internal functions
        ├── Import-Config.ps1
        ├── Get-Config.ps1
        └── Initialize-Database.ps1
```

#### Module Loading Pattern

Avoid expensive `-Force` reloads by checking if the module is already loaded:

```powershell
$modulePath = Join-Path $root '{project}\{project}.psm1'
$moduleName = '{project}-common'

if (Test-Path -LiteralPath $modulePath) {
    $loadedModule = Get-Module -Name $moduleName -ErrorAction SilentlyContinue
    if (-not $loadedModule) {
        Import-Module -Name $modulePath -ErrorAction Stop
    }
}
```

#### Module Naming

- Module file: `{project}.psm1`
- Module name (for Get-Module): `{project}-common`
- Consistent naming enables reliable module detection across launchers.

### 6. Service Management

For projects with multiple PowerShell services (API, Core workers, etc.), use these patterns.

#### Process Detection

Use `Get-CimInstance Win32_Process` for efficient process filtering:

```powershell
function Get-ServiceProcessIds {
    param([string]$ScriptName)

    $processIds = @()
    $filter = "Name = 'pwsh.exe' OR Name = 'powershell.exe'"
    $processes = Get-CimInstance Win32_Process -Filter $filter -ErrorAction SilentlyContinue

    foreach ($proc in $processes) {
        if ($proc.CommandLine -like "*$ScriptName*") {
            $processIds += $proc.ProcessId
        }
    }
    return $processIds
}
```

#### Port Availability Check

Use .NET TcpClient for fast port checks (avoids expensive netstat calls):

```powershell
function Test-PortInUse {
    param([int]$Port)

    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $connect = $tcpClient.BeginConnect('127.0.0.1', $Port, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne(100, $false)  # 100ms timeout

        if ($wait) {
            $tcpClient.EndConnect($connect)
            $tcpClient.Close()
            return $true
        }
        return $false
    }
    catch {
        return $false
    }
}
```

#### Graceful Shutdown Strategy

1. Try graceful stop via API endpoint (if service exposes one)
2. Send termination signal to process
3. Wait with timeout for process exit
4. Force kill if graceful shutdown fails
5. Clean up PID files

### 7. Logging Standards

#### Structured Logging Function

Use a centralized logging function with tags, timestamps, and optional colors:

```powershell
function Write-FormattedLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Tag,

        [Parameter(Mandatory)]
        [string]$Log,

        [ValidateSet('Info', 'Warn', 'Error', 'Debug')]
        [string]$Level = 'Info'
    )

    $timestamp = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
    $icon = switch ($Level) {
        'Info'  { '○' }
        'Warn'  { '△' }
        'Error' { '✕' }
        'Debug' { '◇' }
    }

    $message = "$timestamp $icon [$Tag] $Log"

    # Console output with color
    $color = switch ($Level) {
        'Info'  { 'Cyan' }
        'Warn'  { 'Yellow' }
        'Error' { 'Red' }
        'Debug' { 'Gray' }
    }
    Write-Host $message -ForegroundColor $color

    # Also write to log file
    $logDir = Join-Path $script:RepoRoot 'logs'
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    $logFile = Join-Path $logDir "$Tag.log"
    Add-Content -Path $logFile -Value $message
}
```

#### Log Directory Structure

```
logs/
├── api.log           # API request/response logs
├── core.log          # Core worker logs
├── auth.log          # Authentication events
├── cron.log          # Scheduled job logs
└── exceptions.log    # Unhandled exceptions
```

#### Timestamp Format

Use ISO8601 format: `yyyy-MM-ddTHH:mm:ss` (e.g., `2024-01-15T14:30:45`)

### 8. Configuration Management

#### Configuration Hierarchy

1. **Default values** in code (fallback)
2. **JSON config file** (`config/{project}.json`)
3. **Environment variables** (highest priority override)

#### Configuration Loading Pattern

```powershell
function Import-ProjectConfig {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ConfigPath
    )

    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        Write-Warning "Config file not found: $ConfigPath"
        return $null
    }

    try {
        $config = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json
        return $config
    }
    catch {
        Write-Error "Failed to parse config: $_"
        return $null
    }
}

# Usage with environment override
$config = Import-ProjectConfig -ConfigPath (Join-Path $repoRoot 'config\project.json')
$apiPort = if ($env:PROJECT_API_PORT) { [int]$env:PROJECT_API_PORT } else { $config.server.apiPort }
```

#### Environment Variable Naming

Use `{PROJECT}_*` prefix for all environment variables:

| Variable               | Purpose              |
| ---------------------- | -------------------- |
| `{PROJECT}_API_PORT`   | API service port     |
| `{PROJECT}_CORE_PORT`  | Core worker port     |
| `{PROJECT}_DB_FILE`    | SQLite database path |
| `{PROJECT}_JWT_SECRET` | JWT signing secret   |
| `{PROJECT}_DEBUG`      | Enable debug logging |

### 9. npm/package.json Integration

#### Script Invocation Pattern

Use consistent flags when invoking PowerShell from npm scripts:

```json
{
	"scripts": {
		"lint:ps": "pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/lint-all.ps1",
		"start": "pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ./service.ps1 -start",
		"stop": "pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ./service.ps1 -stop"
	}
}
```

#### Flag Explanation

| Flag                      | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `-NoLogo`                 | Suppress PowerShell banner (cleaner output)                    |
| `-NoProfile`              | Skip profile loading (faster startup, predictable environment) |
| `-ExecutionPolicy Bypass` | Avoid execution policy restrictions                            |
| `-File`                   | Execute script file (not command string)                       |

### 10. Output Strategy

Choose the appropriate output method based on context:

| Method               | Use Case                                                                   |
| -------------------- | -------------------------------------------------------------------------- |
| `Write-Host`         | Interactive scripts, service launchers, colored status output              |
| `Write-Information`  | Functions that may be composed in pipelines; PSScriptAnalyzer-compliant    |
| `Write-FormattedLog` | Application logging with structured tags, timestamps, and file persistence |
| `Write-Verbose`      | Debug-level output controlled by `-Verbose` flag                           |
| `Write-Output`       | Return values for pipeline processing                                      |
| `Write-Error`        | Non-terminating errors                                                     |
| `throw`              | Terminating errors                                                         |

**Note**: `Write-Host` triggers PSScriptAnalyzer warning `PSAvoidUsingWriteHost`. This is acceptable in:

- Service launcher scripts (interactive)
- CLI tools with colored output
- Build/lint scripts

For reusable functions intended for pipeline composition, prefer `Write-Information` or `Write-Output`.

### 11. PSScriptAnalyzer Configuration

Create a `PSScriptAnalyzerSettings.psd1` for project-specific rules:

```powershell
@{
    Severity = @('Error', 'Warning')

    Rules = @{
        PSAvoidUsingCmdletAliases = @{
            Enable = $true
        }
        PSUseApprovedVerbs = @{
            Enable = $true
        }
        PSUseDeclaredVarsMoreThanAssignments = @{
            Enable = $true
        }
    }

    ExcludeRules = @(
        # Exclude for interactive scripts where Write-Host is intentional
        # 'PSAvoidUsingWriteHost'
    )
}
```

Run analyzer via npm:

```json
{
	"scripts": {
		"lint:ps": "pwsh -NoProfile -ExecutionPolicy Bypass -Command \"Invoke-ScriptAnalyzer -Path . -Recurse -Settings ./PSScriptAnalyzerSettings.psd1\""
	}
}
```

---

## Quick Reference

### Script Header Template

```powershell
#Requires -Version 7.4
Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

# Script root detection
$script:ScriptRoot = $PSScriptRoot
$script:RepoRoot = Split-Path -Parent (Split-Path -Parent $script:ScriptRoot)
```

### Function Template

```powershell
function Get-ExampleData {
    <#
    .SYNOPSIS
    Brief description of what this function does.

    .DESCRIPTION
    Detailed description if needed.

    .PARAMETER Id
    The identifier to look up.

    .EXAMPLE
    Get-ExampleData -Id 123
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [ValidateNotNullOrEmpty()]
        [int]$Id
    )

    process {
        # Implementation
        [PSCustomObject]@{
            Id = $Id
            Status = 'Active'
        }
    }
}
```

### API Route Handler Template

```powershell
# Route: GET /api/example/{id}
if (-not $WebEvent) { return }

try {
    $context = New-ApiContext -WebEvent $WebEvent
    Write-FormattedLog -Tag 'api' -Log "$($context.Method) $($context.Path)"

    $id = $context.Parameters.id
    if (-not $id) {
        Send-ApiError -Context $context -StatusCode 400 -ErrorCode 'MISSING_ID' -Message 'ID parameter required'
        return
    }

    $result = Get-ExampleData -Id $id
    Send-ApiResponse -Context $context -Data $result
}
catch {
    Send-ApiError -Context $context -StatusCode 500 -ErrorCode 'INTERNAL_ERROR' -Message 'Failed to retrieve data' -Details @{ error = $_.Exception.Message }
}
```

---

## Additional Notes

- **AI-Friendly Structure**: This list uses markdown bullets for easy parsing (e.g., via regex or NLP tools). Each item is self-contained with a key phrase, description, and rationale.
- **PowerShell 7.x Specificity**: These practices are compatible with 7.x features like null-conditional operators (`?.`), ternary operators (`? :`), pipeline chain operators (`&&`/`||`), and improved error handling. 7.6 (LTS) additionally adds `PSForEach()`/`PSWhere()` intrinsic-method aliases, `Get-Clipboard -Delimiter`, `Register-ArgumentCompleter -NativeFallback`, and `Get-Command -ExcludeModule`. Target the latest 7.6 LTS patch for best results.
- **Windows-Only Note**: Spernakit with Pode backend targets Windows (SQL Server, CIM, Win32_Process). Cross-platform patterns are not applicable to this stack.

(Original sources: Microsoft Cmdlet Development Guidelines, PoshCode Style Guide, PoshCode Best Practices)

---

## References

External sources behind this guide:

- Microsoft, Strongly Encouraged Cmdlet Development Guidelines: <https://learn.microsoft.com/en-us/powershell/scripting/developer/cmdlet/strongly-encouraged-development-guidelines?view=powershell-7.6>
- PoshCode, PowerShell Practice and Style Guide: <https://github.com/PoshCode/PowerShellPracticeAndStyle>
- Announcing PowerShell 7.6 (LTS) GA: <https://devblogs.microsoft.com/powershell/announcing-powershell-7-6/>
- PowerShell support lifecycle: <https://learn.microsoft.com/en-us/powershell/scripting/install/powershell-support-lifecycle?view=powershell-7.6>
- `Set-StrictMode` reference: <https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/set-strictmode?view=powershell-7.6>
- PowerShell releases: <https://github.com/PowerShell/PowerShell/releases>
- Related skills: `pode-guidelines`, `htmx-guidelines`

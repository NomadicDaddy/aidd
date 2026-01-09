#!/bin/bash
# =============================================================================
# lib/utils.sh - Utility Functions for AIDD
# =============================================================================
# Logging system, file operations, and helper functions

# -----------------------------------------------------------------------------
# Logging Levels
# -----------------------------------------------------------------------------
: "${LOG_DEBUG:=0}"
: "${LOG_INFO:=1}"
: "${LOG_WARN:=2}"
: "${LOG_ERROR:=3}"

readonly LOG_DEBUG
readonly LOG_INFO
readonly LOG_WARN
readonly LOG_ERROR

# Current log level (can be overridden)
export LOG_LEVEL="${LOG_LEVEL:-1}"

# -----------------------------------------------------------------------------
# Colors for Terminal Output
# -----------------------------------------------------------------------------
: "${COLOR_RED:=$'\033[0;31m'}"
: "${COLOR_GREEN:=$'\033[0;32m'}"
: "${COLOR_YELLOW:=$'\033[0;33m'}"
: "${COLOR_BLUE:=$'\033[0;34m'}"
: "${COLOR_CYAN:=$'\033[0;36m'}"
: "${COLOR_RESET:=$'\033[0m'}"

readonly COLOR_RED
readonly COLOR_GREEN
readonly COLOR_YELLOW
readonly COLOR_BLUE
readonly COLOR_CYAN
readonly COLOR_RESET

# -----------------------------------------------------------------------------
# Logging Functions
# -----------------------------------------------------------------------------

# Check if terminal supports colors
supports_color() {
    if [[ -t 1 ]]; then
        return 0
    fi
    return 1
}

# Log message with level
log() {
    local level="$1"
    shift
    local message="$*"
    local color=""
    local prefix=""

    if [[ $level -lt $LOG_LEVEL ]]; then
        return
    fi

    case "$level" in
        $LOG_DEBUG)
            prefix="[DEBUG]"
            color="$COLOR_CYAN"
            ;;
        $LOG_INFO)
            prefix="[INFO]"
            color="$COLOR_GREEN"
            ;;
        $LOG_WARN)
            prefix="[WARN]"
            color="$COLOR_YELLOW"
            ;;
        $LOG_ERROR)
            prefix="[ERROR]"
            color="$COLOR_RED"
            ;;
    esac

    if supports_color; then
        echo -e "${color}${prefix}${COLOR_RESET} $message" >&2
    else
        echo "$prefix $message" >&2
    fi
}

# Convenience logging functions
log_debug() { log $LOG_DEBUG "$@"; }
log_info() { log $LOG_INFO "$@"; }
log_warn() { log $LOG_WARN "$@"; }
log_error() { log $LOG_ERROR "$@"; }

# Print a section header using log system
log_header() {
    local title="$1"
    local width=60
    local padding=$(( (width - ${#title} - 2) / 2 ))

    echo "" >&2
    printf '=%.0s' $(seq 1 $width) >&2
    echo "" >&2
    printf ' %.0s' $(seq 1 $padding) >&2
    if supports_color; then
        echo -e "${COLOR_BLUE}${title}${COLOR_RESET}" >&2
    else
        echo "$title" >&2
    fi
    printf ' %.0s' $(seq 1 $padding) >&2
    echo "" >&2
    printf '=%.0s' $(seq 1 $width) >&2
    echo "" >&2
}

# -----------------------------------------------------------------------------
# File Operations
# -----------------------------------------------------------------------------

# Create directory if it doesn't exist
ensure_dir() {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        log_debug "Created directory: $dir"
    fi
}

# Get absolute path
abs_path() {
    local path="$1"
    if [[ -d "$path" ]]; then
        cd "$path" && pwd
    else
        local dir
        dir=$(dirname "$path")
        local base
        base=$(basename "$path")
        cd "$dir" 2>/dev/null && printf "%s/%s" "$(pwd)" "$base"
    fi
}

# Check if command exists
command_exists() {
    local cmd="$1"
    command -v "$cmd" >/dev/null 2>&1
}

# -----------------------------------------------------------------------------
# System Compatibility Checks
# -----------------------------------------------------------------------------

# Check Bash version (requires 4.0+)
# Usage: check_bash_version
# Returns: 0 if compatible, 1 if not
check_bash_version() {
    local required_major=4
    local required_minor=0

    if [[ -z "${BASH_VERSINFO[0]}" ]]; then
        log_error "Unable to determine Bash version"
        return 1
    fi

    local major="${BASH_VERSINFO[0]}"
    local minor="${BASH_VERSINFO[1]:-0}"

    if [[ $major -lt $required_major ]]; then
        log_error "Bash $required_major.$required_minor or higher is required (found: $major.$minor)"
        return 1
    fi

    log_debug "Bash version check passed: $major.$minor"
    return 0
}

# Check platform compatibility
# Usage: check_platform_compatibility
# Returns: 0 if compatible, 1 if not
check_platform_compatibility() {
    local platform
    platform="$(uname -s 2>/dev/null)"

    case "$platform" in
        Linux*|Darwin*|CYGWIN*|MINGW*|MSYS*)
            log_debug "Platform check passed: $platform"
            return 0
            ;;
        *)
            log_warn "Unsupported or unknown platform: $platform (may experience issues)"
            return 0  # Warning only, don't fail
            ;;
    esac
}

# Check required external dependencies
# Usage: check_required_dependencies
# Returns: 0 if all found, 1 if any missing
check_required_dependencies() {
    local -a required_commands=("cat" "grep" "find" "mkdir" "basename" "dirname")
    local missing=false

    for cmd in "${required_commands[@]}"; do
        if ! command_exists "$cmd"; then
            log_error "Required command not found: $cmd"
            missing=true
        fi
    done

    if [[ "$missing" == true ]]; then
        return 1
    fi

    log_debug "Required dependencies check passed"
    return 0
}

# Run all system compatibility checks
# Usage: check_system_compatibility
# Returns: 0 if all checks pass, 1 if any fail
check_system_compatibility() {
    local all_passed=true

    if ! check_bash_version; then
        all_passed=false
    fi

    if ! check_platform_compatibility; then
        all_passed=false
    fi

    if ! check_required_dependencies; then
        all_passed=false
    fi

    if [[ "$all_passed" == false ]]; then
        log_error "System compatibility checks failed"
        return 1
    fi

    log_debug "All system compatibility checks passed"
    return 0
}

# -----------------------------------------------------------------------------
# Security Functions
# -----------------------------------------------------------------------------

# Validate path to prevent path traversal attacks
# Usage: validate_path <path> <base_dir>
# Returns: 0 if valid, 1 if invalid
validate_path() {
    local path="$1"
    local base_dir="$2"

    # Check for path traversal patterns
    if [[ "$path" == *".."* ]]; then
        log_error "Path traversal detected: $path"
        return 1
    fi

    # If base_dir provided, ensure resolved path is within it
    if [[ -n "$base_dir" ]]; then
        local resolved_base
        local resolved_path

        resolved_base=$(cd "$base_dir" && pwd) || return 1

        # For paths that don't exist yet, validate the parent directory
        if [[ ! -e "$path" ]]; then
            local parent_dir
            parent_dir=$(dirname "$path")
            if [[ -d "$parent_dir" ]]; then
                resolved_path=$(cd "$parent_dir" && pwd)/$(basename "$path")
            else
                # Parent doesn't exist, validate the path string directly
                resolved_path="$resolved_base/$path"
            fi
        else
            resolved_path=$(cd "$(dirname "$path")" && pwd)/$(basename "$path")
        fi

        # Check if resolved path starts with base directory
        if [[ "$resolved_path" != "$resolved_base"* ]]; then
            log_error "Path outside base directory: $path (base: $base_dir)"
            return 1
        fi
    fi

    return 0
}

# Validate file for safe copying
# Usage: validate_file_for_copy <file_path> [max_size_mb]
# Returns: 0 if valid, 1 if invalid
validate_file_for_copy() {
    local file_path="$1"
    local max_size_mb="${2:-100}"  # Default 100MB limit
    local max_size_bytes=$((max_size_mb * 1024 * 1024))

    # Check if file exists
    if [[ ! -e "$file_path" ]]; then
        log_error "File does not exist: $file_path"
        return 1
    fi

    # Check if we have read permission
    if [[ ! -r "$file_path" ]]; then
        log_error "No read permission for: $file_path"
        return 1
    fi

    # For regular files, check size
    if [[ -f "$file_path" ]]; then
        local file_size
        file_size=$(stat -c%s "$file_path" 2>/dev/null || stat -f%z "$file_path" 2>/dev/null)

        if [[ -n "$file_size" && $file_size -gt $max_size_bytes ]]; then
            log_error "File too large: $file_path ($(( file_size / 1024 / 1024 ))MB > ${max_size_mb}MB)"
            return 1
        fi
    fi

    return 0
}

# Safe copy with validation and permission checks
# Usage: safe_copy <source> <destination> [base_dir] [max_size_mb]
# Returns: 0 on success, 1 on failure
safe_copy() {
    local source="$1"
    local destination="$2"
    local base_dir="$3"
    local max_size_mb="${4:-100}"

    # Validate source path
    if ! validate_file_for_copy "$source" "$max_size_mb"; then
        return 1
    fi

    # Validate destination path if base_dir provided
    if [[ -n "$base_dir" ]]; then
        if ! validate_path "$destination" "$base_dir"; then
            return 1
        fi
    fi

    # Ensure destination directory exists and is writable
    local dest_dir
    dest_dir=$(dirname "$destination")
    if [[ ! -d "$dest_dir" ]]; then
        if ! mkdir -p "$dest_dir" 2>/dev/null; then
            log_error "Cannot create destination directory: $dest_dir"
            return 1
        fi
    fi

    if [[ ! -w "$dest_dir" ]]; then
        log_error "No write permission for directory: $dest_dir"
        return 1
    fi

    # Perform the copy with error handling
    if [[ -d "$source" ]]; then
        if ! cp -r "$source" "$destination" 2>/dev/null; then
            log_error "Failed to copy directory: $source -> $destination"
            return 1
        fi
    else
        if ! cp "$source" "$destination" 2>/dev/null; then
            log_error "Failed to copy file: $source -> $destination"
            return 1
        fi
    fi

    log_debug "Safely copied: $source -> $destination"
    return 0
}

# Validate CLI command path to prevent command injection
# Usage: validate_cli_command <command_name>
# Returns: 0 if valid, 1 if invalid
validate_cli_command() {
    local cmd="$1"

    # Check if command contains dangerous characters (use grep for complex pattern)
    if echo "$cmd" | grep -qE '[;&|<>`$()]'; then
        log_error "Invalid characters in command: $cmd"
        return 1
    fi

    # Verify the command exists and get its full path
    if ! command -v "$cmd" >/dev/null 2>&1; then
        log_error "Command not found: $cmd"
        return 1
    fi

    return 0
}

# Sanitize model arguments to prevent injection
# Usage: sanitize_model_args <args...>
# Returns: Sanitized arguments via stdout
sanitize_model_args() {
    local -a sanitized_args=()
    local arg

    for arg in "$@"; do
        # Remove dangerous characters from arguments
        # Allow alphanumeric, dashes, underscores, dots, slashes, colons, equals
        if [[ "$arg" =~ ^[a-zA-Z0-9._/:=-]+$ ]]; then
            sanitized_args+=("$arg")
        else
            log_warn "Skipping potentially dangerous argument: $arg"
        fi
    done

    echo "${sanitized_args[@]}"
}

# -----------------------------------------------------------------------------
# CLI Process Monitoring
# -----------------------------------------------------------------------------

# Monitor coprocess output for error patterns with idle timeout detection
# Usage: monitor_coprocess_output <log_level_for_errors>
# Requires: COPROC to be set up, global error pattern variables
# Returns: Exit code based on detected conditions or actual process exit code
monitor_coprocess_output() {
    local error_log_level="${1:-warn}"  # Default to warn, can be "error"
    local saw_no_assistant=false
    local saw_idle_timeout=false
    local saw_provider_error=false
    local nudge_sent=false

    local nudge_timeout="${IDLE_NUDGE_TIMEOUT:-$DEFAULT_IDLE_NUDGE_TIMEOUT}"
    local final_timeout=$((${IDLE_TIMEOUT:-$DEFAULT_IDLE_TIMEOUT} - nudge_timeout))

    # Monitor output for error patterns and idle timeout
    while true; do
        local line=""
        local timeout_value="$nudge_timeout"
        [[ "$nudge_sent" == true ]] && timeout_value="$final_timeout"

        # Check if coprocess is still alive and file descriptors are valid
        if ! kill -0 "$COPROC_PID" 2>/dev/null; then
            # Process has terminated
            break
        fi

        if [[ -z "${COPROC[0]}" ]] || [[ -z "${COPROC[1]}" ]]; then
            # File descriptors not set, coprocess not properly initialized
            break
        fi

        if IFS= read -r -t "$timeout_value" line <&"${COPROC[0]}" 2>/dev/null; then
            echo "$line"

            # Reset nudge state if we got output
            nudge_sent=false

            # Check for "no assistant messages" pattern
            if [[ "$line" == *"$PATTERN_NO_ASSISTANT"* ]]; then
                saw_no_assistant=true
                if [[ "$error_log_level" == "error" ]]; then
                    log_error "Detected 'no assistant messages' from model; aborting."
                else
                    log_warn "Detected 'no assistant messages' from model"
                fi
                kill -TERM "$COPROC_PID" 2>/dev/null || true
                break
            fi

            # Check for provider error pattern
            if [[ "$line" == *"$PATTERN_PROVIDER_ERROR"* ]]; then
                saw_provider_error=true
                if [[ "$error_log_level" == "error" ]]; then
                    log_error "Detected 'provider error' from model; aborting."
                else
                    log_warn "Detected 'provider error' from model"
                fi
                kill -TERM "$COPROC_PID" 2>/dev/null || true
                break
            fi

            continue
        fi

        # Check if process is still running
        if kill -0 "$COPROC_PID" 2>/dev/null; then
            # First timeout: Send nudge message
            if [[ "$nudge_sent" == false ]]; then
                nudge_sent=true
                log_warn "No output for ${nudge_timeout}s. Sending nudge to agent..."

                # Send nudge message via stdin (if coprocess supports it)
                cat << 'EOF' >&"${COPROC[1]}" 2>/dev/null || true

---

SYSTEM NUDGE: You haven't produced any output for several minutes. Are you stuck?

If you're encountering repeated errors that you can't resolve:
1. Describe what you've tried and what's blocking you
2. Consider following the three-strike rule from error-handling-patterns.md:
   - After 3 failed attempts, abort the current task
   - Document the issue in progress.md or todo.md
   - Move on to the next feature
3. Commit any working progress before moving on

Please respond with either:
- Your current status and what you're working on, OR
- A decision to abort and move to the next task

---

EOF
                log_debug "Nudge sent. Waiting ${final_timeout}s for response..."
                continue
            fi

            # Second timeout: Hard kill
            saw_idle_timeout=true
            if [[ "$error_log_level" == "error" ]]; then
                log_error "Idle timeout (${IDLE_TIMEOUT:-$DEFAULT_IDLE_TIMEOUT}s total) waiting for output; aborting."
            else
                log_warn "Idle timeout (${IDLE_TIMEOUT:-$DEFAULT_IDLE_TIMEOUT}s total) waiting for output"
            fi
            kill -TERM "$COPROC_PID" 2>/dev/null || true
            break
        fi

        # Process has finished
        break
    done

    # Wait for process to finish and get exit code
    wait "$COPROC_PID" 2>/dev/null
    local exit_code=$?

    # Return custom exit codes based on detected conditions
    if [[ "$saw_no_assistant" == true ]]; then
        [[ "$error_log_level" != "error" ]] && log_debug "Exiting with NO_ASSISTANT code: $EXIT_NO_ASSISTANT"
        return "$EXIT_NO_ASSISTANT"
    fi

    if [[ "$saw_idle_timeout" == true ]]; then
        [[ "$error_log_level" != "error" ]] && log_debug "Exiting with IDLE_TIMEOUT code: $EXIT_IDLE_TIMEOUT"
        return "$EXIT_IDLE_TIMEOUT"
    fi

    if [[ "$saw_provider_error" == true ]]; then
        [[ "$error_log_level" != "error" ]] && log_debug "Exiting with PROVIDER_ERROR code: $EXIT_PROVIDER_ERROR"
        return "$EXIT_PROVIDER_ERROR"
    fi

    [[ "$error_log_level" != "error" ]] && log_debug "Exiting with exit code: $exit_code"
    return "$exit_code"
}

# -----------------------------------------------------------------------------
# Cleanup Handler
# -----------------------------------------------------------------------------

# Cleanup on exit
cleanup_on_exit() {
    local exit_code=$?
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        if [[ "$NO_CLEAN" != "true" ]]; then
            log_debug "Cleaning up temporary directory: $TEMP_DIR"
            rm -rf "$TEMP_DIR"
        else
            log_info "Temporary directory preserved: $TEMP_DIR"
        fi
    fi
    exit $exit_code
}

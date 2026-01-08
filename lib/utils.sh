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
: "${COLOR_RED:='\033[0;31m'}"
: "${COLOR_GREEN:='\033[0;32m'}"
: "${COLOR_YELLOW:='\033[0;33m'}"
: "${COLOR_BLUE:='\033[0;34m'}"
: "${COLOR_CYAN:='\033[0;36m'}"
: "${COLOR_RESET:='\033[0m'}"

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
        echo -e "${color}${prefix}${COLOR_RESET} $message"
    else
        echo "$prefix $message"
    fi
}

# Convenience logging functions
log_debug() { log $LOG_DEBUG "$@"; }
log_info() { log $LOG_INFO "$@"; }
log_warn() { log $LOG_WARN "$@"; }
log_error() { log $LOG_ERROR "$@"; }

# Print a section header
print_header() {
    local title="$1"
    local width=60
    local padding=$(( (width - ${#title} - 2) / 2 ))

    echo ""
    printf '=%.0s' $(seq 1 $width)
    echo ""
    printf ' %.0s' $(seq 1 $padding)
    if supports_color; then
        echo -e "${COLOR_BLUE}${title}${COLOR_RESET}"
    else
        echo "$title"
    fi
    printf ' %.0s' $(seq 1 $padding)
    echo ""
    printf '=%.0s' $(seq 1 $width)
    echo ""
}

# Print a section header using log system
log_header() {
    local title="$1"
    local width=60
    local padding=$(( (width - ${#title} - 2) / 2 ))

    echo ""
    printf '=%.0s' $(seq 1 $width)
    echo ""
    printf ' %.0s' $(seq 1 $padding)
    if supports_color; then
        echo -e "${COLOR_BLUE}${title}${COLOR_RESET}"
    else
        echo "$title"
    fi
    printf ' %.0s' $(seq 1 $padding)
    echo ""
    printf '=%.0s' $(seq 1 $width)
    echo ""
}

# Print a progress indicator
print_progress() {
    local current="$1"
    local total="$2"
    local prefix="${3:-Progress}"
    local width=40
    local percent=$((current * 100 / total))
    local filled=$((width * current / total))
    local empty=$((width - filled))

    printf "\r${prefix}: ["
    printf '#%.0s' $(seq 1 $filled)
    printf '.%.0s' $(seq 1 $empty)
    printf "] %d%%" "$percent"
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

# Remove directory if it exists
remove_dir() {
    local dir="$1"
    if [[ -d "$dir" ]]; then
        rm -rf "$dir"
        log_debug "Removed directory: $dir"
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

# Check if file is readable
is_readable() {
    local file="$1"
    [[ -f "$file" && -r "$file" ]]
}

# Check if file is writable
is_writable() {
    local file="$1"
    [[ -f "$file" && -w "$file" ]]
}

# Check if command exists
command_exists() {
    local cmd="$1"
    command -v "$cmd" >/dev/null 2>&1
}

# Get file size in bytes
file_size() {
    local file="$1"
    if [[ -f "$file" ]]; then
        stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0
    else
        echo 0
    fi
}

# Get file modification time (Unix timestamp)
file_mtime() {
    local file="$1"
    if [[ -f "$file" ]]; then
        stat -c%Y "$file" 2>/dev/null || stat -f%m "$file" 2>/dev/null || echo 0
    else
        echo 0
    fi
}

# -----------------------------------------------------------------------------
# Command Helpers
# -----------------------------------------------------------------------------

# Execute command with timeout
exec_with_timeout() {
    local timeout="$1"
    shift
    local cmd="$@"

    if command_exists timeout; then
        timeout "$timeout" bash -c "$cmd"
    else
        # Fallback without timeout
        eval "$cmd"
    fi
}

# Retry a command multiple times
retry_command() {
    local max_attempts="$1"
    local delay="$2"
    shift 2
    local cmd="$@"
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        log_debug "Attempt $attempt of $max_attempts: $cmd"
        if eval "$cmd"; then
            return 0
        fi

        if [[ $attempt -lt $max_attempts ]]; then
            log_warn "Command failed, retrying in $delay seconds..."
            sleep "$delay"
        fi

        attempt=$((attempt + 1))
    done

    log_error "Command failed after $max_attempts attempts: $cmd"
    return 1
}

# -----------------------------------------------------------------------------
# String Utilities
# -----------------------------------------------------------------------------

# Sanitize string for safe filename
sanitize_filename() {
    local string="$1"
    echo "$string" | sed 's/[^a-zA-Z0-9._-]/_/g' | tr '[:upper:]' '[:lower:]'
}

# Truncate string with ellipsis
truncate_string() {
    local string="$1"
    local max_length="$2"
    local ellipsis="${3:-...}"

    if [[ ${#string} -le $max_length ]]; then
        echo "$string"
    else
        echo "${string:0:$((max_length - ${#ellipsis}))}${ellipsis}"
    fi
}

# -----------------------------------------------------------------------------
# Duration Formatting
# -----------------------------------------------------------------------------

# Format duration in seconds to human readable
format_duration() {
    local seconds="$1"

    if [[ $seconds -lt 60 ]]; then
        echo "${seconds}s"
    elif [[ $seconds -lt 3600 ]]; then
        local minutes=$((seconds / 60))
        local remaining=$((seconds % 60))
        if [[ $remaining -eq 0 ]]; then
            echo "${minutes}m"
        else
            echo "${minutes}m ${remaining}s"
        fi
    else
        local hours=$((seconds / 3600))
        local minutes=$(( (seconds % 3600) / 60 ))
        local remaining=$((seconds % 60))
        if [[ $minutes -eq 0 && $remaining -eq 0 ]]; then
            echo "${hours}h"
        elif [[ $remaining -eq 0 ]]; then
            echo "${hours}h ${minutes}m"
        else
            echo "${hours}h ${minutes}m ${remaining}s"
        fi
    fi
}

# -----------------------------------------------------------------------------
# Temporary Directory Management
# -----------------------------------------------------------------------------

# Create temporary directory with prefix
temp_dir() {
    local prefix="${1:-aidd}"
    mktemp -d "/tmp/${prefix}.XXXXXX"
}

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

# Register cleanup handler
trap cleanup_on_exit EXIT INT TERM

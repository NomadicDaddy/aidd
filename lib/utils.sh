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

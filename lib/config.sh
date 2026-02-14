#!/bin/bash
set -euo pipefail
# =============================================================================
# lib/config.sh - Configuration Constants and Defaults for AIDD
# =============================================================================
# Exit codes, default values, and pattern constants for error detection
# Supports both OpenCode and KiloCode CLIs

# -----------------------------------------------------------------------------
# AIDD Version
# -----------------------------------------------------------------------------
_AIDD_VERSION_FILE="$(dirname "${BASH_SOURCE[0]}")/../VERSION"
if [[ -f "$_AIDD_VERSION_FILE" ]]; then
    AIDD_VERSION=$(cat "$_AIDD_VERSION_FILE" | tr -d '[:space:]')
else
    AIDD_VERSION="unknown"
fi
export AIDD_VERSION
unset _AIDD_VERSION_FILE

# -----------------------------------------------------------------------------
# Exit Codes (Standard)
# -----------------------------------------------------------------------------
: "${EXIT_SUCCESS:=0}"              # Successful execution
: "${EXIT_GENERAL_ERROR:=1}"        # General/unspecified error
: "${EXIT_INVALID_ARGS:=2}"         # Invalid command-line arguments
: "${EXIT_NOT_FOUND:=3}"            # File or resource not found
: "${EXIT_PERMISSION_DENIED:=4}"    # Permission denied
: "${EXIT_TIMEOUT:=5}"              # Timeout occurred
: "${EXIT_ABORTED:=6}"              # Operation aborted by user
: "${EXIT_VALIDATION_ERROR:=7}"     # Validation failed
: "${EXIT_CLI_ERROR:=8}"            # CLI error

readonly EXIT_SUCCESS
readonly EXIT_GENERAL_ERROR
readonly EXIT_INVALID_ARGS
readonly EXIT_NOT_FOUND
readonly EXIT_PERMISSION_DENIED
readonly EXIT_TIMEOUT
readonly EXIT_ABORTED
readonly EXIT_VALIDATION_ERROR
readonly EXIT_CLI_ERROR

# -----------------------------------------------------------------------------
# Exit Codes (CLI-Specific)
# -----------------------------------------------------------------------------
: "${EXIT_NO_ASSISTANT:=70}"        # Model returned no assistant messages
: "${EXIT_IDLE_TIMEOUT:=71}"        # Idle timeout
: "${EXIT_PROVIDER_ERROR:=72}"      # Provider error
: "${EXIT_PROJECT_COMPLETE:=73}"    # Project completion confirmed (stop iterations)
: "${EXIT_RATE_LIMITED:=74}"        # API rate limit hit (pause and retry)
: "${EXIT_SIGNAL_TERMINATED:=124}"  # Terminated by signal (SIGINT/SIGTERM)

readonly EXIT_NO_ASSISTANT
readonly EXIT_IDLE_TIMEOUT
readonly EXIT_PROVIDER_ERROR
readonly EXIT_PROJECT_COMPLETE
readonly EXIT_RATE_LIMITED
readonly EXIT_SIGNAL_TERMINATED

# -----------------------------------------------------------------------------
# Default Values
# -----------------------------------------------------------------------------
: "${DEFAULT_CLI:="opencode"}"           # Default CLI to use
: "${DEFAULT_MAX_ITERATIONS:=10}"        # Default max iterations (0 = unlimited)
: "${DEFAULT_TIMEOUT:=3600}"             # Default timeout in seconds (60 minutes)
: "${DEFAULT_IDLE_TIMEOUT:=900}"         # Default idle timeout in seconds (15 minutes)
: "${DEFAULT_IDLE_NUDGE_TIMEOUT:=300}"   # Default idle nudge timeout in seconds (5 minutes)
: "${DEFAULT_NO_CLEAN:=false}"           # Default: clean up artifacts
: "${DEFAULT_QUIT_ON_ABORT:=0}"          # Default: continue on abort indefinitely
: "${DEFAULT_RATE_LIMIT_BUFFER:=60}"     # Seconds to wait after rate limit reset time
: "${DEFAULT_RATE_LIMIT_BACKOFF:=300}"   # Fallback sleep (seconds) when reset time unparseable

readonly DEFAULT_CLI
readonly DEFAULT_MAX_ITERATIONS
readonly DEFAULT_TIMEOUT
readonly DEFAULT_IDLE_TIMEOUT
readonly DEFAULT_IDLE_NUDGE_TIMEOUT
readonly DEFAULT_NO_CLEAN
readonly DEFAULT_QUIT_ON_ABORT
readonly DEFAULT_RATE_LIMIT_BUFFER
readonly DEFAULT_RATE_LIMIT_BACKOFF

# -----------------------------------------------------------------------------
# Directory and File Names
# -----------------------------------------------------------------------------
: "${DEFAULT_METADATA_DIR:=".automaker"}"                    # Metadata directory name (hidden)
: "${DEFAULT_PROMPTS_DIR:="prompts"}"                   # Prompts directory name
: "${DEFAULT_ITERATIONS_DIR:="iterations"}"             # Iterations directory name
: "${DEFAULT_SCAFFOLDING_DIR:="scaffolding"}"           # Scaffolding directory name
: "${DEFAULT_TEMPLATES_DIR:="templates"}"               # Templates directory name
: "${DEFAULT_STATE_FILE:=".iteration_state"}"           # Iteration state file name
: "${DEFAULT_FEATURES_DIR:="features"}"                      # Features subdirectory name
: "${FEATURE_FILE_NAME:="feature.json"}"                      # Individual feature file name
: "${DEFAULT_SPEC_FILE:="app_spec.txt"}"                      # Application spec file name
: "${DEFAULT_TODO_FILE:="todo.md"}"                     # Todo file name
: "${DEFAULT_PROJECT_STRUCTURE_FILE:="project_structure.md"}"  # Project structure file name
: "${DEFAULT_PIPELINE_FILE:="pipeline.json"}"           # Pipeline file name
: "${DEFAULT_STRUCTURED_LOG_SUFFIX:=".json"}" # Structured log file suffix

readonly DEFAULT_METADATA_DIR
readonly DEFAULT_PROMPTS_DIR
readonly DEFAULT_ITERATIONS_DIR
readonly DEFAULT_SCAFFOLDING_DIR
readonly DEFAULT_TEMPLATES_DIR
readonly DEFAULT_STATE_FILE
readonly DEFAULT_FEATURES_DIR
readonly FEATURE_FILE_NAME
readonly DEFAULT_TODO_FILE
readonly DEFAULT_SPEC_FILE
readonly DEFAULT_PROJECT_STRUCTURE_FILE
readonly DEFAULT_PIPELINE_FILE
readonly DEFAULT_STRUCTURED_LOG_SUFFIX

# -----------------------------------------------------------------------------
# Pattern Constants for Error Detection (CLI-Agnostic)
# -----------------------------------------------------------------------------
: "${PATTERN_NO_ASSISTANT:="The model returned no assistant messages"}"
: "${PATTERN_PROVIDER_ERROR:="Provider returned error"}"
: "${PATTERN_RATE_LIMIT:="hit your limit"}"

readonly PATTERN_NO_ASSISTANT
readonly PATTERN_PROVIDER_ERROR
readonly PATTERN_RATE_LIMIT

# General error patterns
: "${PATTERN_GENERAL_ERROR:="ERROR|error:|Error"}"
: "${PATTERN_WARNING:="WARNING|Warning|warning:"}"
: "${PATTERN_PERMISSION_DENIED:="permission denied|access denied|not authorized"}"
: "${PATTERN_NOT_FOUND:="not found|does not exist|no such file"}"

readonly PATTERN_GENERAL_ERROR
readonly PATTERN_WARNING
readonly PATTERN_PERMISSION_DENIED
readonly PATTERN_NOT_FOUND

# Session/connection patterns
: "${PATTERN_SESSION_ENDED:="session ended|disconnected|connection lost"}"
: "${PATTERN_AUTH_ERROR:="authentication|auth:|unauthorized|401|403"}"

readonly PATTERN_SESSION_ENDED
readonly PATTERN_AUTH_ERROR

# File operation patterns
: "${PATTERN_FILE_ERROR:="cannot open|cannot write|cannot read|read-only|write-protected"}"

readonly PATTERN_FILE_ERROR

# Timeout patterns
: "${PATTERN_TIMEOUT_ERROR:="timed out|timeout|deadline exceeded|took too long"}"

readonly PATTERN_TIMEOUT_ERROR

# -----------------------------------------------------------------------------
# Template Markers
# -----------------------------------------------------------------------------
: "${TEMPLATE_DATE_MARKER:="{yyyy-mm-dd}"}"
: "${TEMPLATE_FEATURE_MARKER:="{Short name of the feature}"}"

readonly TEMPLATE_DATE_MARKER
readonly TEMPLATE_FEATURE_MARKER

# -----------------------------------------------------------------------------
# Iteration State Constants
# -----------------------------------------------------------------------------
: "${STATE_IDLE:="idle"}"
: "${STATE_RUNNING:="running"}"
: "${STATE_PAUSED:="paused"}"
: "${STATE_COMPLETED:="completed"}"
: "${STATE_FAILED:="failed"}"
: "${STATE_ABORTED:="aborted"}"

readonly STATE_IDLE
readonly STATE_RUNNING
readonly STATE_PAUSED
readonly STATE_COMPLETED
readonly STATE_FAILED
readonly STATE_ABORTED

# -----------------------------------------------------------------------------
# Phase Constants
# -----------------------------------------------------------------------------
: "${PHASE_ONBOARDING:="onboarding"}"
: "${PHASE_INITIALIZER:="initializer"}"
: "${PHASE_CODING:="coding"}"
: "${PHASE_TODO:="todo"}"
: "${PHASE_VALIDATE:="validate"}"
: "${PHASE_DIRECTIVE:="directive"}"
: "${PHASE_IN_PROGRESS:="in-progress"}"
: "${PHASE_AUDIT:="audit"}"

readonly PHASE_ONBOARDING
readonly PHASE_INITIALIZER
readonly PHASE_CODING
readonly PHASE_TODO
readonly PHASE_VALIDATE
readonly PHASE_DIRECTIVE
readonly PHASE_IN_PROGRESS
readonly PHASE_AUDIT

# -----------------------------------------------------------------------------
# Audit Configuration
# -----------------------------------------------------------------------------
: "${DEFAULT_AUDITS_DIR:="audits"}"
: "${DEFAULT_AUDIT_REPORTS_DIR:="audit-reports"}"
: "${DEFAULT_TARGET_AUDITS_DIR:="audits"}"

readonly DEFAULT_AUDITS_DIR
readonly DEFAULT_AUDIT_REPORTS_DIR
readonly DEFAULT_TARGET_AUDITS_DIR

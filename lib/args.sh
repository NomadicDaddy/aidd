#!/bin/bash
# =============================================================================
# lib/args.sh - Argument Parsing Module for AIDD
# =============================================================================
# Command-line argument parsing, validation, and default application
# Supports both OpenCode and KiloCode CLIs

# Source configuration for defaults
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

# -----------------------------------------------------------------------------
# Global Variables for Parsed Arguments (exported for use in main script)
# -----------------------------------------------------------------------------
export CLI_TYPE=""
export MODEL=""
export INIT_MODEL_OVERRIDE=""
export CODE_MODEL_OVERRIDE=""
export SPEC_FILE=""
export MAX_ITERATIONS=""
export PROJECT_DIR=""
export TIMEOUT=""
export IDLE_TIMEOUT=""
export NO_CLEAN=false
export QUIT_ON_ABORT="0"
export CONTINUE_ON_TIMEOUT=false
export SHOW_FEATURE_LIST=false
export TODO_MODE=false

# Effective model values (computed after parsing)
export INIT_MODEL_EFFECTIVE=""
export CODE_MODEL_EFFECTIVE=""
export INIT_MODEL_ARGS=()
export CODE_MODEL_ARGS=()

# -----------------------------------------------------------------------------
# Print Help/Usage Information
# -----------------------------------------------------------------------------
print_help() {
    cat << EOF
Usage: $0 [OPTIONS]

AIDD - AI Development Driver
Supports both OpenCode and KiloCode CLIs

OPTIONS:
    --cli CLI               CLI to use: opencode or kilocode (optional, default: $DEFAULT_CLI)
    --project-dir DIR       Project directory (required unless --feature-list or --todo is specified)
    --spec FILE             Specification file (optional for existing codebases, required for new projects)
    --max-iterations N      Maximum iterations (optional, unlimited if not specified)
    --timeout N             Timeout in seconds (optional, default: $DEFAULT_TIMEOUT)
    --idle-timeout N        Idle timeout in seconds (optional, default: $DEFAULT_IDLE_TIMEOUT)
    --idle-nudge-timeout N  Idle nudge timeout in seconds (optional, default: $DEFAULT_IDLE_NUDGE_TIMEOUT)
    --model MODEL           Model to use (optional)
    --init-model MODEL      Model for initializer/onboarding prompts (optional, overrides --model)
    --code-model MODEL      Model for coding prompts (optional, overrides --model)
    --no-clean              Skip log cleaning on exit (optional)
    --quit-on-abort N       Quit after N consecutive failures (optional, default: 0=continue indefinitely)
    --continue-on-timeout   Continue to next iteration if CLI times out (exit 124) instead of aborting (optional)
    --feature-list          Display project feature list status and exit (optional)
    --todo                  Use TODO mode: look for and complete todo items instead of new features (optional)
    --help                  Show this help message

EXAMPLES:
    # Using OpenCode (default)
    $0 --project-dir ./myproject --spec ./spec.txt
    $0 --cli opencode --project-dir ./myproject --model gpt-4 --max-iterations 5

    # Using KiloCode
    $0 --cli kilocode --project-dir ./myproject --spec ./spec.txt
    $0 --cli kilocode --project-dir ./myproject --init-model claude --code-model gpt-4 --no-clean

    # Other operations
    $0 --project-dir ./myproject --feature-list
    $0 --project-dir ./myproject --todo

For more information, visit: https://github.com/example/aidd
EOF
}

# -----------------------------------------------------------------------------
# Parse Command-Line Arguments
# -----------------------------------------------------------------------------
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --cli)
                CLI_TYPE="$2"
                shift 2
                ;;
            --model)
                MODEL="$2"
                shift 2
                ;;
            --init-model)
                INIT_MODEL_OVERRIDE="$2"
                shift 2
                ;;
            --code-model)
                CODE_MODEL_OVERRIDE="$2"
                shift 2
                ;;
            --spec)
                SPEC_FILE="$2"
                shift 2
                ;;
            --max-iterations)
                MAX_ITERATIONS="$2"
                shift 2
                ;;
            --project-dir)
                PROJECT_DIR="$2"
                shift 2
                ;;
            --timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            --idle-timeout)
                IDLE_TIMEOUT="$2"
                shift 2
                ;;
            --idle-nudge-timeout)
                IDLE_NUDGE_TIMEOUT="$2"
                shift 2
                ;;
            --no-clean)
                NO_CLEAN=true
                shift
                ;;
            --quit-on-abort)
                QUIT_ON_ABORT="$2"
                shift 2
                ;;
            --continue-on-timeout)
                CONTINUE_ON_TIMEOUT=true
                shift
                ;;
            --feature-list)
                SHOW_FEATURE_LIST=true
                shift
                ;;
            --todo)
                TODO_MODE=true
                shift
                ;;
            -h|--help)
                print_help
                exit 0
                ;;
            *)
                echo "Error: Unknown option: $1" >&2
                echo "Use --help for usage information"
                exit $EXIT_INVALID_ARGS
                ;;
        esac
    done
}

# -----------------------------------------------------------------------------
# Validate Required Arguments
# -----------------------------------------------------------------------------
validate_args() {
    # Validate CLI type
    if [[ -z "$CLI_TYPE" ]]; then
        CLI_TYPE="$DEFAULT_CLI"
    fi

    case "$CLI_TYPE" in
        opencode|kilocode)
            # Valid CLI type
            ;;
        *)
            log_error "Invalid CLI type: $CLI_TYPE"
            log_info "Valid options: opencode, kilocode"
            return $EXIT_INVALID_ARGS
            ;;
    esac

    # Check required --project-dir argument (unless --feature-list or --todo is specified)
    if [[ "$SHOW_FEATURE_LIST" != true && "$TODO_MODE" != true && -z "$PROJECT_DIR" ]]; then
        log_error "Missing required argument --project-dir"
        log_info "Use --help for usage information"
        return $EXIT_INVALID_ARGS
    fi

    return 0
}

# -----------------------------------------------------------------------------
# Apply Defaults for Unset Arguments
# -----------------------------------------------------------------------------
apply_defaults() {
    # Default timeout
    if [[ -z "$TIMEOUT" ]]; then
        TIMEOUT=$DEFAULT_TIMEOUT
    fi

    # Default idle-timeout
    if [[ -z "$IDLE_TIMEOUT" ]]; then
        IDLE_TIMEOUT=$DEFAULT_IDLE_TIMEOUT
    fi
}

# -----------------------------------------------------------------------------
# Get Effective Model Values
# -----------------------------------------------------------------------------
get_effective_models() {
    # Determine effective init model
    if [[ -n "$INIT_MODEL_OVERRIDE" ]]; then
        INIT_MODEL_EFFECTIVE="$INIT_MODEL_OVERRIDE"
    else
        INIT_MODEL_EFFECTIVE="$MODEL"
    fi

    # Determine effective code model
    if [[ -n "$CODE_MODEL_OVERRIDE" ]]; then
        CODE_MODEL_EFFECTIVE="$CODE_MODEL_OVERRIDE"
    else
        CODE_MODEL_EFFECTIVE="$MODEL"
    fi

    # Build model args arrays
    INIT_MODEL_ARGS=()
    if [[ -n "$INIT_MODEL_EFFECTIVE" ]]; then
        INIT_MODEL_ARGS=(--model "$INIT_MODEL_EFFECTIVE")
    fi

    CODE_MODEL_ARGS=()
    if [[ -n "$CODE_MODEL_EFFECTIVE" ]]; then
        CODE_MODEL_ARGS=(--model "$CODE_MODEL_EFFECTIVE")
    fi
}

# -----------------------------------------------------------------------------
# Show Feature List Status
# -----------------------------------------------------------------------------
show_feature_list() {
    local project_dir="$1"
    local feature_list_file="$project_dir/$DEFAULT_METADATA_DIR/$DEFAULT_FEATURE_LIST_FILE"

    if [[ ! -f "$feature_list_file" ]]; then
        log_error "Feature list not found at: $feature_list_file"
        log_info "Run in an existing AIDD project or specify --project-dir"
        return $EXIT_NOT_FOUND
    fi

    # Parse feature_list.json using jq if available
    if ! command_exists jq; then
        log_error "'jq' command is required for --feature-list option"
        log_info "Install jq to display feature list: https://stedolan.github.io/jq/"
        return $EXIT_GENERAL_ERROR
    fi

    local features_json
    features_json=$(cat "$feature_list_file")

    # Get overall statistics
    local total
    local passing
    local failing
    local open
    local closed

    total=$(echo "$features_json" | jq '. | length')
    passing=$(echo "$features_json" | jq '[.[] | select(.passes == true)] | length')
    failing=$(echo "$features_json" | jq '[.[] | select(.passes == false and .status == "open")] | length')
    closed=$(echo "$features_json" | jq '[.[] | select(.status == "resolved")] | length')
    open=$(echo "$features_json" | jq '[.[] | select(.status == "open")] | length')

    # Print summary header
    echo ""
    echo "=============================================================================="
    echo "Project Feature List Status: $project_dir"
    echo "=============================================================================="
    echo ""
    printf "%-15s %s\n" "Total Features:" "$total"
    printf "%-15s %s\n" "Passing:" "$passing"
    printf "%-15s %s\n" "Failing:" "$failing"
    printf "%-15s %s\n" "Open:" "$open"
    printf "%-15s %s\n" "Closed:" "$closed"
    printf "%-15s %s\n" "Complete:" "$((passing * 100 / total))%"
    echo ""

    # Group by status
    echo "------------------------------------------------------------------------------"
    echo "Features by Status:"
    echo "------------------------------------------------------------------------------"
    echo ""

    # Passing features
    echo "✅ PASSING ($passing features):"
    echo ""
    echo "$features_json" | jq -r '.[] | select(.passes == true) | "\(.description)"' | while IFS= read -r line; do
        echo "  • $line"
    done
    echo ""

    # Open/failing features
    echo "⚠️  OPEN ($failing features):"
    echo ""
    echo "$features_json" | jq -r '.[] | select(.passes == false and .status == "open") | "\(.description) - [\(.priority)]"' | while IFS= read -r line; do
        echo "  • $line"
    done
    echo ""

    # Group by category
    echo "------------------------------------------------------------------------------"
    echo "Features by Category:"
    echo "------------------------------------------------------------------------------"
    echo ""

    for category in functional style performance testing devex docs process; do
        local count
        count=$(echo "$features_json" | jq --arg cat "$category" '[.[] | select(.category == $cat)] | length')
        if [[ $count -gt 0 ]]; then
            printf "%-20s %s\n" "$category:" "$count features"
        fi
    done
    echo ""

    # Group by priority
    echo "------------------------------------------------------------------------------"
    echo "Features by Priority:"
    echo "------------------------------------------------------------------------------"
    echo ""

    for priority in critical high medium low; do
        local count
        count=$(echo "$features_json" | jq --arg pri "$priority" '[.[] | select(.priority == $pri)] | length')
        if [[ $count -gt 0 ]]; then
            printf "%-20s %s\n" "$priority:" "$count features"
        fi
    done
    echo ""

    echo "=============================================================================="
    echo ""

    return 0
}

# -----------------------------------------------------------------------------
# Main Entry Point for Argument Parsing
# -----------------------------------------------------------------------------
# Usage: source lib/args.sh && init_args "$@"
init_args() {
    parse_args "$@"
    validate_args
    local result=$?
    if [[ $result -ne 0 ]]; then
        return $result
    fi
    apply_defaults
    get_effective_models

    # Handle --feature-list option (display and exit)
    if [[ "$SHOW_FEATURE_LIST" == true ]]; then
        show_feature_list "$PROJECT_DIR"
        exit $EXIT_SUCCESS
    fi

    # Handle --todo option (export mode flag for use by main script)
    # TODO_MODE is handled by determine_prompt() in lib/iteration.sh
    # We just need to pass through and let iteration.sh handle it

    return 0
}

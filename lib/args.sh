#!/bin/bash
# =============================================================================
# lib/args.sh - Argument Parsing Module for AIDD
# =============================================================================
# Command-line argument parsing, validation, and default application
# Supports OpenCode, KiloCode, and Claude Code CLIs

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
export SHOW_STATUS=false
export SYNC_MODE=false
export DRY_RUN_MODE=false
export TODO_MODE=false
export VALIDATE_MODE=false
export CUSTOM_PROMPT=""

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
Supports OpenCode, KiloCode, and Claude Code CLIs

OPTIONS:
    --cli CLI               CLI to use: opencode, kilocode, or claude-code (optional, default: $DEFAULT_CLI)
    --project-dir DIR       Project directory (required unless --status or --todo is specified)
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
    --status               Display project status (features + TODOs) and exit (optional)
    --sync                  Synchronize AIDD and AutoMaker data:
                            - Features: .aidd/features/*/feature.json ↔ .automaker/features/*/feature.json
                              (matches by description, copies unique features both ways,
                              resolves conflicts using most recent timestamp)
                            - Spec files: .aidd/app_spec.txt ↔ .automaker/app_spec.txt
                              (copies only if missing on one side)
    --dry-run               Preview sync changes without modifying files (use with --sync)
    --todo                  Use TODO mode: look for and complete todo items instead of new features (optional)
    --validate              Run validation mode to check incomplete features and todos (optional)
    --prompt "DIRECTIVE"    Use custom directive instead of automatic prompt selection (optional)
    --help                  Show this help message

EXAMPLES:
    # Using OpenCode (default)
    $0 --project-dir ./myproject --spec ./app_spec.txt
    $0 --cli opencode --project-dir ./myproject --model gpt-4 --max-iterations 5

    # Using KiloCode
    $0 --cli kilocode --project-dir ./myproject --spec ./app_spec.txt
    $0 --cli kilocode --project-dir ./myproject --init-model claude --code-model gpt-4 --no-clean

    # Using Claude Code
    $0 --cli claude-code --project-dir ./myproject --spec ./app_spec.txt
    $0 --cli claude-code --project-dir ./myproject --model sonnet --max-iterations 10

    # Other operations
    $0 --project-dir ./myproject --status
    $0 --project-dir ./myproject --todo

    # Custom directive mode
    $0 --project-dir ./myproject --prompt "perform a full quality control check against the project"
    $0 --project-dir ./myproject --prompt "review all security vulnerabilities and fix them"
    $0 --project-dir ./myproject --prompt "optimize performance bottlenecks" --max-iterations 1

For more information, visit: https://github.com/NomadicDaddy/aidd
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
            --status)
                SHOW_STATUS=true
                shift
                ;;
            --todo)
                TODO_MODE=true
                shift
                ;;
            --validate)
                VALIDATE_MODE=true
                shift
                ;;
            --sync)
                SYNC_MODE=true
                shift
                ;;
            --dry-run)
                DRY_RUN_MODE=true
                shift
                ;;
            --prompt)
                CUSTOM_PROMPT="$2"
                shift 2
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
        opencode|kilocode|claude-code)
            # Valid CLI type
            ;;
        *)
            log_error "Invalid CLI type: $CLI_TYPE"
            log_info "Valid options: opencode, kilocode, claude-code"
            return $EXIT_INVALID_ARGS
            ;;
    esac

    # Check required --project-dir argument (unless --status or --todo is specified)
    
    # Validate --sync requirements (jq dependency)
    if [[ "$SYNC_MODE" == true ]]; then
        if ! command -v jq &> /dev/null; then
            log_error "--sync requires 'jq' for JSON processing"
            log_error "Install with: apt-get install jq (Linux) or brew install jq (macOS)"
            return $EXIT_CLI_ERROR
        fi
    fi

    return 0
}

# -----------------------------------------------------------------------------
# Apply Defaults for Unset Arguments
# -----------------------------------------------------------------------------
apply_defaults() {
    # Default project directory to current directory if not specified
    if [[ -z "$PROJECT_DIR" ]]; then
        PROJECT_DIR="."
    fi

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
# Show Project Status
# -----------------------------------------------------------------------------
show_status() {
    local project_dir="$1"
    local features_dir="$project_dir/$DEFAULT_METADATA_DIR/$DEFAULT_FEATURES_DIR"
    local todo_file=""
    local status_file="$project_dir/$DEFAULT_METADATA_DIR/status.md"

    if [[ ! -d "$features_dir" ]]; then
        log_error "Features directory not found at: $features_dir"
        log_info "Run in an existing AIDD project or specify --project-dir"
        return $EXIT_NOT_FOUND
    fi

    # Search for todo files in priority order
    # First check .aidd/todo.md (standard location)
    if [[ -f "$project_dir/$DEFAULT_METADATA_DIR/$DEFAULT_TODO_FILE" ]]; then
        todo_file="$project_dir/$DEFAULT_METADATA_DIR/$DEFAULT_TODO_FILE"
    else
        # Search for common todo file names in project directory
        local todo_patterns=("todo.md" "todos.md" "TODO.md" "TODOs.md" "TODO-list.md" "todo-list.md" "tasks.md" "TASKS.md")
        for pattern in "${todo_patterns[@]}"; do
            if [[ -f "$project_dir/$pattern" ]]; then
                todo_file="$project_dir/$pattern"
                break
            fi
        done
    fi

    # Parse features from distributed structure using jq
    if ! command_exists jq; then
        log_error "'jq' command is required for --status option"
        log_info "Install jq to display status: https://stedolan.github.io/jq/"
        return $EXIT_GENERAL_ERROR
    fi

    # Collect all features into a JSON array
    local features_json="["
    local first=true
    while IFS= read -r -d '' feature_file; do
        if [[ "$first" == true ]]; then
            first=false
        else
            features_json+=","
        fi
        features_json+=$(cat "$feature_file")
    done < <(find "$features_dir" -type f -name "feature.json" -print0 2>/dev/null)
    features_json+="]"

    # Get overall statistics
    local total
    local passing
    local failing
    local open
    local closed

    total=$(echo "$features_json" | jq '. | length')
    passing=$(echo "$features_json" | jq '[.[] | select(.metadata.aidd_passes == true)] | length')
    failing=$(echo "$features_json" | jq '[.[] | select(.metadata.aidd_passes == false and .status == "backlog")] | length')
    closed=$(echo "$features_json" | jq '[.[] | select(.status == "completed")] | length')
    open=$(echo "$features_json" | jq '[.[] | select(.status == "backlog")] | length')

    # Print summary header
    # Write output to temp file, then display and save
    local temp_status="/tmp/aidd_status_$$.md"
    {
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
    if [[ $total -gt 0 ]]; then
        printf "%-15s %s\n" "Complete:" "$((passing * 100 / total))%"
    else
        printf "%-15s %s\n" "Complete:" "0%"
    fi
    echo ""

    # Group by status
    echo "------------------------------------------------------------------------------"
    echo "Features by Status:"
    echo "------------------------------------------------------------------------------"
    echo ""

    # Passing features - sorted by priority (critical → high → medium → low)
    echo "✅ PASSING ($passing features):"
    echo ""
    echo "$features_json" | jq -r '
        .[] |
        select(.metadata.aidd_passes == true) |
        {
            description: .description,
            priority: .priority,
            deps: (.depends_on | length // 0)
        } |
        "\(.description)|\(.priority)|\(.deps)"
    ' | awk -F'|' '
        {
            priority_val = $2;
            if (priority_val == "1") { priority_num = 4; priority_str = "critical"; }
            else if (priority_val == "2") { priority_num = 3; priority_str = "high"; }
            else if (priority_val == "3") { priority_num = 2; priority_str = "medium"; }
            else if (priority_val == "4") { priority_num = 1; priority_str = "low"; }
            else { priority_num = 0; priority_str = "unknown"; }
            print priority_num "|" $1 "|" priority_str "|" $3;
        }
    ' | sort -t'|' -k1 -nr | cut -d'|' -f2- | while IFS='|' read -r description priority deps; do
        if [[ "$deps" -gt 0 ]]; then
            if [[ "$deps" -eq 1 ]]; then
                echo "  • $description [$priority] ($deps dep)"
            else
                echo "  • $description [$priority] ($deps deps)"
            fi
        else
            echo "  • $description [$priority]"
        fi
    done
    echo ""

    # Open/failing features - sorted by priority (critical → high → medium → low)
    echo "⚠️  OPEN ($failing features):"
    echo ""
    echo "$features_json" | jq -r '
        .[] |
        select(.metadata.aidd_passes == false and .status == "backlog") |
        {
            description: .description,
            priority: .priority,
            deps: (.depends_on | length // 0)
        } |
        "\(.description)|\(.priority)|\(.deps)"
    ' | awk -F'|' '
        {
            priority_val = $2;
            if (priority_val == "1") { priority_num = 4; priority_str = "critical"; }
            else if (priority_val == "2") { priority_num = 3; priority_str = "high"; }
            else if (priority_val == "3") { priority_num = 2; priority_str = "medium"; }
            else if (priority_val == "4") { priority_num = 1; priority_str = "low"; }
            else { priority_num = 0; priority_str = "unknown"; }
            print priority_num "|" $1 "|" priority_str "|" $3;
        }
    ' | sort -t'|' -k1 -nr | cut -d'|' -f2- | while IFS='|' read -r description priority deps; do
        if [[ "$deps" -gt 0 ]]; then
            if [[ "$deps" -eq 1 ]]; then
                echo "  • $description [$priority] ($deps dep)"
            else
                echo "  • $description [$priority] ($deps deps)"
            fi
        else
            echo "  • $description [$priority]"
        fi
    done
    echo ""

    # Group by category
    echo "------------------------------------------------------------------------------"
    echo "Features by Category:"
    echo "------------------------------------------------------------------------------"
    echo ""

    for category in Core UI Security Performance Testing DevEx Documentation; do
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

    # Priorities are now numbers: 1=critical, 2=high, 3=medium, 4=low
    for priority_num in 1 2 3 4; do
        local priority_name
        case $priority_num in
            1) priority_name="critical" ;;
            2) priority_name="high" ;;
            3) priority_name="medium" ;;
            4) priority_name="low" ;;
        esac
        local count
        count=$(echo "$features_json" | jq --argjson pri "$priority_num" '[.[] | select(.priority == $pri)] | length')
        if [[ $count -gt 0 ]]; then
            printf "%-20s %s\n" "$priority_name:" "$count features"
        fi
    done
    echo ""

    # Display TODO items from todo file if it exists
    if [[ -n "$todo_file" && -f "$todo_file" ]]; then
        local todo_filename=$(basename "$todo_file")
        echo "=============================================================================="
        echo "TODO Items from $todo_filename:"
        echo "=============================================================================="
        echo ""

        # Count total, completed, and incomplete todo items
        local todo_total=0
        local todo_completed=0
        local todo_incomplete=0

        while IFS= read -r line; do
            # Skip empty lines and lines that don't start with -
            [[ -z "$line" || "${line:0:1}" != "-" ]] && continue

            ((todo_total++))

            # Check if line contains [x] for completed or [ ] for incomplete
            # Using grep for pattern matching to avoid bash regex issues
            if echo "$line" | grep -q '\[x\]'; then
                ((todo_completed++))
            elif echo "$line" | grep -q '\[ \]'; then
                ((todo_incomplete++))
            fi
        done < "$todo_file"

        printf "%-20s %s\n" "Total TODOs:" "$todo_total"
        printf "%-20s %s\n" "Completed:" "$todo_completed"
        printf "%-20s %s\n" "Incomplete:" "$todo_incomplete"
        if [[ $todo_total -gt 0 ]]; then
            printf "%-20s %s\n" "Complete:" "$((todo_completed * 100 / todo_total))%"
        else
            printf "%-20s %s\n" "Complete:" "0%"
        fi
        echo ""

        # Display incomplete TODOs
        if [[ $todo_incomplete -gt 0 ]]; then
            echo "⚠️  INCOMPLETE TODOs ($todo_incomplete items):"
            echo ""
            while IFS= read -r line; do
                # Skip empty lines and lines that don't start with -
                [[ -z "$line" || "${line:0:1}" != "-" ]] && continue

                # Check for incomplete todo items (-[ ])
                if echo "$line" | grep -q '\[ \]'; then
                    # Extract the todo text (remove the -[ ] prefix)
                    local todo_text="${line#- [ ]}"
                    echo "  •$todo_text"
                fi
            done < "$todo_file"
            echo ""
        fi

        # Display completed TODOs
        if [[ $todo_completed -gt 0 ]]; then
            echo "✅ COMPLETED TODOs ($todo_completed items):"
            echo ""
            while IFS= read -r line; do
                # Skip empty lines and lines that don't start with -
                [[ -z "$line" || "${line:0:1}" != "-" ]] && continue

                # Check for completed todo items (-[x])
                if echo "$line" | grep -q '\[x\]'; then
                    # Extract the todo text (remove the -[x] prefix)
                    local todo_text="${line#- [x]}"
                    echo "  •$todo_text"
                fi
            done < "$todo_file"
            echo ""
        fi
    else
        echo "------------------------------------------------------------------------------"
        echo "No todo file found (searched: .aidd/todo.md, todo.md, todos.md, TODO.md, TODOs.md, TODO-list.md, todo-list.md, tasks.md, TASKS.md)"
        echo "------------------------------------------------------------------------------"
        echo ""
    fi

    echo "=============================================================================="
    echo ""

    } > "$temp_status"
    
    # Display the output
    cat "$temp_status"
    
    # Save to status.md
    mv "$temp_status" "$status_file"

    return 0
}

# -----------------------------------------------------------------------------
# Main Entry Point for Argument Parsing
# -----------------------------------------------------------------------------
# Usage: source lib/args.sh && init_args "$@"
init_args() {
    parse_args "$@"
    apply_defaults
    validate_args
    local result=$?
    if [[ $result -ne 0 ]]; then
        return $result
    fi
    get_effective_models

    # Handle --status option (display and exit)
    
    # Handle --sync option (synchronize and exit)
    if [[ "$SYNC_MODE" == true ]]; then
        # Find metadata directory
        local metadata_dir=""
        if [[ -d "$PROJECT_DIR/$DEFAULT_METADATA_DIR" ]]; then
            metadata_dir="$PROJECT_DIR/$DEFAULT_METADATA_DIR"
        else
            log_error "Metadata directory not found: $PROJECT_DIR/$DEFAULT_METADATA_DIR"
            log_info "Run aidd normally first to initialize the project"
            exit $EXIT_NOT_FOUND
        fi
        
        # Source and run sync
        source "$(dirname "${BASH_SOURCE[0]}")/sync.sh"
        sync_features "$PROJECT_DIR" "$metadata_dir"
        exit $EXIT_SUCCESS
    fi

    if [[ "$SHOW_STATUS" == true ]]; then
        show_status "$PROJECT_DIR"
        exit $EXIT_SUCCESS
    fi

    # Handle --todo option (export mode flag for use by main script)
    # TODO_MODE is handled by determine_prompt() in lib/iteration.sh
    # We just need to pass through and let iteration.sh handle it

    return 0
}

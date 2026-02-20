#!/bin/bash
set -euo pipefail
# =============================================================================
# lib/args.sh - Argument Parsing Module for AIDD
# =============================================================================
# Command-line argument parsing, validation, and default application
# Supports OpenCode, KiloCode, and Claude Code CLIs

# Source configuration for defaults (includes AIDD_VERSION)
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

# -----------------------------------------------------------------------------
# Global Variables for Parsed Arguments (exported for use in main script)
# -----------------------------------------------------------------------------
export CLI_TYPE=""
export MODEL=""
export INIT_MODEL_OVERRIDE=""
export CODE_MODEL_OVERRIDE=""
export AUDIT_MODEL_OVERRIDE=""
export SPEC_FILE=""
export MAX_ITERATIONS=""
export PROJECT_DIR=""
export TIMEOUT=""
export IDLE_TIMEOUT=""
export NO_CLEAN=false
export QUIT_ON_ABORT="0"
export CONTINUE_ON_TIMEOUT=false
export SHOW_STATUS=false
export TODO_MODE=false
export VALIDATE_MODE=false
export IN_PROGRESS_MODE=false
export CUSTOM_PROMPT=""
export EXTRACT_STRUCTURED=false
export EXTRACT_BATCH=false
export CHECK_FEATURES=false
export STOP_WHEN_DONE=true
export AUDIT_MODE=false
export AUDIT_NAME=""
export AUDIT_NAMES=()
export AUDIT_INDEX=0
export AUDIT_ON_COMPLETION_NAMES=()
export CODE_AFTER_AUDIT=false
export STOP_SIGNAL=false
export FILTER_BY=""
export FILTER_VALUE=""

# Effective model values (computed after parsing)
export INIT_MODEL_EFFECTIVE=""
export CODE_MODEL_EFFECTIVE=""
export AUDIT_MODEL_EFFECTIVE=""
export INIT_MODEL_ARGS=()
export CODE_MODEL_ARGS=()
export AUDIT_MODEL_ARGS=()

# -----------------------------------------------------------------------------
# Print Help/Usage Information
# -----------------------------------------------------------------------------
print_help() {
    cat << EOF
AIDD - AI Development Driver v${AIDD_VERSION}
Supports OpenCode, KiloCode, and Claude Code CLIs

Usage: $0 [OPTIONS]

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
    --audit-model MODEL     Model for audit prompts (optional, overrides --model)
    --no-clean              Skip log cleaning on exit (optional)
    --quit-on-abort N       Quit after N consecutive failures (optional, default: 0=continue indefinitely)
    --continue-on-timeout   Continue to next iteration if CLI times out (exit 124) instead of aborting (optional)
    --status               Display project status (features + TODOs) and exit (optional)
    --todo                  Use TODO mode: look for and complete todo items instead of new features (optional)
    --validate              Run validation mode to check incomplete features and todos (optional)
    --in-progress           Focus only on features with "status": "in_progress" (optional)
    --prompt "DIRECTIVE"    Use custom directive instead of automatic prompt selection (optional)
    --extract-structured    Extract structured JSON from iteration logs after each iteration (optional)
    --extract-batch         Batch extract structured JSON from all existing iteration logs and exit
    --check-features        Validate all feature.json files against schema and exit
    --stop-when-done      Stop when mode-specific work is complete (default: true)
    --no-stop-when-done   Keep iterating even after mode-specific work is complete
    --stop                  Signal a running AIDD instance to stop after current iteration (creates .stop file)
    --audit AUDIT[,...]   Run audit mode with one or more audits (e.g., SECURITY or DEAD_CODE,PERFORMANCE)
    --audit-all             Run all available audits sequentially
    --audit-on-completion AUDIT[,...]  Run specified audits when project reaches completion
    --code-after-audit      After audits, run coding to fix findings, then re-audit until clean
    --filter-by FIELD       Filter features by a JSON field (e.g., category, priority, status)
    --filter VALUE          Value to match for --filter-by (e.g., Backend, 1, backlog)
    --version               Show version information
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
    $0 --project-dir ./myproject --todo
    $0 --project-dir ./myproject --in-progress --no-stop-when-done

    # Custom directive mode
    $0 --project-dir ./myproject --prompt "perform a full quality control check against the project"
    $0 --project-dir ./myproject --prompt "review all security vulnerabilities and fix them"
    $0 --project-dir ./myproject --prompt "optimize performance bottlenecks" --max-iterations 1

    # Audit mode (single audit)
    $0 --project-dir ./myproject --audit SECURITY
    $0 --project-dir ./myproject --audit CODE_QUALITY --max-iterations 1

    # Audit mode (multiple audits - run sequentially)
    $0 --project-dir ./myproject --audit DEAD_CODE,PERFORMANCE
    $0 --project-dir ./myproject --audit SECURITY,CODE_QUALITY,TECHDEBT --max-iterations 2

    # Audit mode (all audits)
    $0 --project-dir ./myproject --audit-all
    $0 --project-dir ./myproject --audit-all --max-iterations 1

    # Post-completion audits (run audits when project completes)
    $0 --project-dir ./myproject --audit-on-completion SECURITY,CODE_QUALITY

    # Audit with auto-remediation (audit → fix → re-audit until clean)
    $0 --project-dir ./myproject --audit SECURITY --code-after-audit

    # Full pipeline: build → audit on completion → remediate → re-audit
    $0 --project-dir ./myproject --audit-on-completion SECURITY,DEAD_CODE --code-after-audit

    # Filter features by field value
    $0 --project-dir ./myproject --filter-by category --filter Backend
    $0 --project-dir ./myproject --filter-by priority --filter 1
    $0 --project-dir ./myproject --filter-by status --filter in_progress
    $0 --project-dir ./myproject --status --filter-by category --filter Database

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
            --audit-model)
                AUDIT_MODEL_OVERRIDE="$2"
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
            --in-progress)
                IN_PROGRESS_MODE=true
                shift
                ;;
            --extract-structured)
                EXTRACT_STRUCTURED=true
                shift
                ;;
            --extract-batch)
                EXTRACT_BATCH=true
                shift
                ;;
            --check-features)
                CHECK_FEATURES=true
                shift
                ;;
            --stop-when-done)
                STOP_WHEN_DONE=true
                shift
                ;;
            --no-stop-when-done)
                STOP_WHEN_DONE=false
                shift
                ;;
            --stop)
                STOP_SIGNAL=true
                shift
                ;;
            --prompt)
                CUSTOM_PROMPT="$2"
                shift 2
                ;;
            --audit)
                AUDIT_MODE=true
                # Parse comma-separated audit names (e.g., "DEAD_CODE, PERFORMANCE")
                local audit_input="$2"
                # Remove spaces around commas and split by comma
                IFS=',' read -ra audit_array <<< "$audit_input"
                for audit in "${audit_array[@]}"; do
                    # Trim whitespace from each audit name
                    audit="${audit#"${audit%%[![:space:]]*}"}"
                    audit="${audit%"${audit##*[![:space:]]}"}"
                    if [[ -n "$audit" ]]; then
                        AUDIT_NAMES+=("$audit")
                    fi
                done
                # Set first audit as current (for backwards compatibility)
                if [[ ${#AUDIT_NAMES[@]} -gt 0 ]]; then
                    AUDIT_NAME="${AUDIT_NAMES[0]}"
                fi
                shift 2
                ;;
            --audit-all)
                AUDIT_MODE=true
                # Find all audit files and add them to AUDIT_NAMES
                # Skip reference documents (type: 'reference' in frontmatter)
                local audits_dir="$SCRIPT_DIR/$DEFAULT_AUDITS_DIR"
                if [[ -d "$audits_dir" ]]; then
                    while IFS= read -r audit_file; do
                        # Skip reference documents
                        if grep -q "^type: 'reference'" "$audit_file" 2>/dev/null; then
                            continue
                        fi
                        local audit_name
                        audit_name=$(basename "$audit_file" .md)
                        AUDIT_NAMES+=("$audit_name")
                    done < <(find "$audits_dir" -maxdepth 1 -name "*.md" -type f | sort)
                fi
                if [[ ${#AUDIT_NAMES[@]} -gt 0 ]]; then
                    AUDIT_NAME="${AUDIT_NAMES[0]}"
                fi
                shift
                ;;
            --audit-on-completion)
                # Parse comma-separated audit names for post-completion audits
                local aoc_input="$2"
                IFS=',' read -ra aoc_array <<< "$aoc_input"
                for audit in "${aoc_array[@]}"; do
                    # Trim whitespace
                    audit="${audit#"${audit%%[![:space:]]*}"}"
                    audit="${audit%"${audit##*[![:space:]]}"}"
                    if [[ -n "$audit" ]]; then
                        AUDIT_ON_COMPLETION_NAMES+=("$audit")
                    fi
                done
                shift 2
                ;;
            --code-after-audit)
                CODE_AFTER_AUDIT=true
                shift
                ;;
            --filter-by)
                FILTER_BY="$2"
                shift 2
                ;;
            --filter)
                FILTER_VALUE="$2"
                shift 2
                ;;
            -h|--help)
                print_help
                exit 0
                ;;
            -v|--version)
                echo "AIDD v${AIDD_VERSION}"
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

    # Validate --filter-by and --filter are used together
    if [[ -n "$FILTER_BY" && -z "$FILTER_VALUE" ]]; then
        log_error "--filter-by requires --filter <value>"
        return $EXIT_INVALID_ARGS
    fi
    if [[ -z "$FILTER_BY" && -n "$FILTER_VALUE" ]]; then
        log_error "--filter requires --filter-by <field>"
        return $EXIT_INVALID_ARGS
    fi

    # Validate --filter-by field name against known feature.json fields
    if [[ -n "$FILTER_BY" ]]; then
        local valid_filter_fields="id category description title status priority passes dependencies spec model error summary branchName startedAt createdAt updatedAt skipTests thinkingLevel reasoningEffort planningMode requirePlanApproval"
        if [[ ! " $valid_filter_fields " =~ " $FILTER_BY " ]]; then
            log_error "Invalid --filter-by field: '$FILTER_BY'"
            log_info "Valid fields: $valid_filter_fields"
            return $EXIT_INVALID_ARGS
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

    # Determine effective audit model (falls back to code model, then base model)
    if [[ -n "$AUDIT_MODEL_OVERRIDE" ]]; then
        AUDIT_MODEL_EFFECTIVE="$AUDIT_MODEL_OVERRIDE"
    else
        AUDIT_MODEL_EFFECTIVE="$CODE_MODEL_EFFECTIVE"
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

    AUDIT_MODEL_ARGS=()
    if [[ -n "$AUDIT_MODEL_EFFECTIVE" ]]; then
        AUDIT_MODEL_ARGS=(--model "$AUDIT_MODEL_EFFECTIVE")
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
    # First check .automaker/todo.md (standard location)
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

    # Collect all features into a JSON array (with validation)
    local features_json="["
    local first=true
    local invalid_count=0
    local invalid_files=""
    # Use ls with while loop (most reliable on Windows/Git Bash)
    while IFS= read -r feature_file; do
        [[ -z "$feature_file" || ! -f "$feature_file" ]] && continue
        # Validate JSON before adding
        local file_content
        file_content=$(cat "$feature_file")
        if ! echo "$file_content" | jq -e . >/dev/null 2>&1; then
            invalid_count=$((invalid_count + 1))
            invalid_files+="  - $feature_file
"
            continue
        fi
        if [[ "$first" == true ]]; then
            first=false
        else
            features_json+=","
        fi
        features_json+="$file_content"
    done < <(ls -1 "$features_dir"/*/feature.json 2>/dev/null)
    features_json+="]"

    # Apply --filter-by / --filter if active (uses --arg/--argjson to prevent jq injection)
    if [[ -n "$FILTER_BY" && -n "$FILTER_VALUE" ]]; then
        if [[ "$FILTER_VALUE" =~ ^[0-9]+$ || "$FILTER_VALUE" == "true" || "$FILTER_VALUE" == "false" ]]; then
            features_json=$(echo "$features_json" | jq -c --arg field "$FILTER_BY" --argjson val "$FILTER_VALUE" '[.[] | select(.[$field] == $val)]')
        else
            features_json=$(echo "$features_json" | jq -c --arg field "$FILTER_BY" --arg val "$FILTER_VALUE" '[.[] | select(.[$field] == $val)]')
        fi
    fi

    # Report invalid files if any
    if [[ $invalid_count -gt 0 ]]; then
        log_warn "$invalid_count feature.json file(s) have invalid JSON and were skipped:"
        echo -e "$invalid_files" >&2
    fi

    # Get overall statistics
    local total
    local passing
    local failing
    local open
    local closed

    total=$(echo "$features_json" | jq '. | length // 0')
    passing=$(echo "$features_json" | jq '[.[] | select(.passes == true)] | length // 0')
    failing=$(echo "$features_json" | jq '[.[] | select(.passes == false and .status == "backlog")] | length // 0')
    closed=$(echo "$features_json" | jq '[.[] | select(.status == "completed")] | length // 0')
    open=$(echo "$features_json" | jq '[.[] | select(.status == "backlog")] | length // 0')

    # Ensure variables are numeric integers
    if [[ -n "$total" && "$total" =~ ^[0-9]+$ ]]; then
        total=$((total))
    else
        total=0
    fi
    if [[ -n "$passing" && "$passing" =~ ^[0-9]+$ ]]; then
        passing=$((passing))
    else
        passing=0
    fi
    if [[ -n "$failing" && "$failing" =~ ^[0-9]+$ ]]; then
        failing=$((failing))
    else
        failing=0
    fi
    if [[ -n "$closed" && "$closed" =~ ^[0-9]+$ ]]; then
        closed=$((closed))
    else
        closed=0
    fi
    if [[ -n "$open" && "$open" =~ ^[0-9]+$ ]]; then
        open=$((open))
    else
        open=0
    fi

    # Print summary header
    # Write output to temp file, then display and save
    local temp_status
    temp_status=$(mktemp /tmp/aidd_status_XXXXXXXXXX.md)
    {
    echo ""
    echo "=============================================================================="
    echo "Project Feature List Status: $(basename "$project_dir")"
    if [[ -n "$FILTER_BY" && -n "$FILTER_VALUE" ]]; then
        echo "Filter: $FILTER_BY = $FILTER_VALUE"
    fi
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
    echo "---"
    echo ""

    # Group by status
    echo "## Features by Status/Priority:"
    echo ""
    echo ""

    # Passing features - grouped by priority
    echo "✅ PASSING ($passing features):"
    echo ""

    for priority_num in 1 2 3 4; do
        local priority_name
        case $priority_num in
            1) priority_name="critical" ;;
            2) priority_name="high" ;;
            3) priority_name="medium" ;;
            4) priority_name="low" ;;
        esac

        # Get features for this priority
        local priority_features
        priority_features=$(echo "$features_json" | jq -r "
            .[] |
            select(.passes == true and .priority == $priority_num) |
            {
                description: .description,
                deps: ((.dependencies | length // 0) | tostring)
            } |
            \"\(.description)|\(.deps)\"
        ")

        if [[ -n "$priority_features" ]]; then
            echo "[$priority_name]"
            echo "$priority_features" | while IFS='|' read -r description deps; do
                # Ensure deps is numeric
                if [[ -n "$deps" && "$deps" =~ ^[0-9]+$ ]]; then
                    deps=$((deps))
                else
                    deps=0
                fi
                if [[ "$deps" -gt 0 ]]; then
                    echo "• $description ($deps deps)"
                else
                    echo "• $description"
                fi
            done
            echo ""
        fi
    done

    # Open/failing features - grouped by priority
    echo "⚠️ OPEN ($failing features):"
    echo ""

    for priority_num in 1 2 3 4; do
        local priority_name
        case $priority_num in
            1) priority_name="critical" ;;
            2) priority_name="high" ;;
            3) priority_name="medium" ;;
            4) priority_name="low" ;;
        esac

        # Get features for this priority
        local priority_features
        priority_features=$(echo "$features_json" | jq -r "
            .[] |
            select(.passes == false and .status == \"backlog\" and .priority == $priority_num) |
            {
                description: .description,
                deps: ((.dependencies | length // 0) | tostring)
            } |
            \"\(.description)|\(.deps)\"
        ")

        if [[ -n "$priority_features" ]]; then
            echo "[$priority_name]"
            echo "$priority_features" | while IFS='|' read -r description deps; do
                # Ensure deps is numeric
                if [[ -n "$deps" && "$deps" =~ ^[0-9]+$ ]]; then
                    deps=$((deps))
                else
                    deps=0
                fi
                if [[ "$deps" -gt 0 ]]; then
                    echo "• $description ($deps deps)"
                else
                    echo "• $description"
                fi
            done
            echo ""
        fi
    done

    echo ""
    echo ""

    echo "---"
    echo ""
    echo "## Features by Category/Priority:"
    echo ""
    echo ""

    # Print header row
    printf "%-20s\t%s\t%s\t%s\t %s\n" "" "critical" "high" "medium" "low"
    echo ""

    # Print counts for each category by priority
    for category in Core UI Security Performance DevEx; do
        local counts=()
        local has_features=false

        for priority_num in 1 2 3 4; do
            local count
            count=$(echo "$features_json" | jq --arg cat "$category" --argjson pri "$priority_num" '[.[] | select(.category == $cat and .priority == $pri)] | length // 0')
            # Ensure count is numeric integer
            if [[ -n "$count" && "$count" =~ ^[0-9]+$ ]]; then
                count=$((count))
            else
                count=0
            fi
            counts+=("$count")
            if [[ $count -gt 0 ]]; then
                has_features=true
            fi
        done

        if [[ "$has_features" == true ]]; then
            local total_count=0
            for count in "${counts[@]}"; do
                total_count=$((total_count + count))
            done
            printf "%-20s\t" "$category ($total_count)"
            for count in "${counts[@]}"; do
                if [[ $count -gt 0 ]]; then
                    printf "%s\t" "$count"
                else
                    printf "\t"
                fi
            done
            echo ""
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

        # Count total, completed, incomplete, and deferred todo items
        local todo_total=0
        local todo_completed=0
        local todo_incomplete=0
        local todo_deferred=0

        while IFS= read -r line; do
            # Skip empty lines and lines that don't start with -
            [[ -z "$line" || "${line:0:1}" != "-" ]] && continue

            todo_total=$((todo_total + 1))

            # Check if line contains [x] for completed, [~] or [!] for deferred, [ ] for incomplete
            # Using grep for pattern matching to avoid bash regex issues
            if echo "$line" | grep -q '\[x\]'; then
                todo_completed=$((todo_completed + 1))
            elif echo "$line" | grep -q '\[[~!]\]'; then
                todo_deferred=$((todo_deferred + 1))
            elif echo "$line" | grep -q '\[ \]'; then
                todo_incomplete=$((todo_incomplete + 1))
            fi
        done < "$todo_file"

        printf "%-20s %s\n" "Total TODOs:" "$todo_total"
        printf "%-20s %s\n" "Completed:" "$todo_completed"
        printf "%-20s %s\n" "Incomplete:" "$todo_incomplete"
        if [[ $todo_deferred -gt 0 ]]; then
            printf "%-20s %s\n" "Deferred:" "$todo_deferred"
        fi
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

        # Display deferred TODOs (manual/external action required, don't block completion)
        if [[ $todo_deferred -gt 0 ]]; then
            echo "⏸️  DEFERRED TODOs ($todo_deferred items):"
            echo ""
            while IFS= read -r line; do
                [[ -z "$line" || "${line:0:1}" != "-" ]] && continue
                if echo "$line" | grep -q '\[[~!]\]'; then
                    local todo_text="${line#- [~]}"
                    todo_text="${todo_text#- [!]}"
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
        echo "## No todo file found (searched: .automaker/todo.md, todo.md, todos.md, TODO.md, TODOs.md, TODO-list.md, todo-list.md, tasks.md, TASKS.md)"
        echo ""
    fi

    echo ""
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
# Validate Feature JSON Files
# -----------------------------------------------------------------------------
validate_features() {
    local project_dir="$1"
    local features_dir="$project_dir/$DEFAULT_METADATA_DIR/$DEFAULT_FEATURES_DIR"

    if [[ ! -d "$features_dir" ]]; then
        log_error "Features directory not found at: $features_dir"
        log_info "Run in an existing AIDD project or specify --project-dir"
        return $EXIT_NOT_FOUND
    fi

    if ! command_exists jq; then
        log_error "'jq' command is required for --check-features option"
        log_info "Install jq to validate features: https://stedolan.github.io/jq/"
        return $EXIT_GENERAL_ERROR
    fi

    echo ""
    echo "=============================================================================="
    echo "Feature JSON Validation: $project_dir"
    echo "=============================================================================="
    echo ""

    # Collect all feature file paths
    local -a feature_files=()
    while IFS= read -r ff; do
        [[ -f "$ff" ]] && feature_files+=("$ff")
    done < <(ls -1 "$features_dir"/*/feature.json 2>/dev/null)
    local total_files=${#feature_files[@]}

    if [[ $total_files -eq 0 ]]; then
        echo "No feature files found."
        echo ""
        echo "=============================================================================="
        return 0
    fi

    # Counters
    local valid_files=0
    local invalid_files=0
    local error_details=""
    local status_backlog=0 status_pending=0 status_running=0 status_completed=0
    local status_failed=0 status_verified=0 status_waiting_approval=0 status_in_progress=0
    local status_none=0
    declare -A parsed_files

    # Pass 1: Collect all valid feature IDs for dependency validation (single jq call)
    local all_ids_file
    all_ids_file=$(mktemp)
    jq -s '[.[].id // empty]' "${feature_files[@]}" 2>/dev/null > "$all_ids_file"

    # Write jq validation program to temp file (avoids bash escaping issues with != on Git Bash/Windows)
    local jq_filter
    jq_filter=$(mktemp)
    trap "rm -f '$jq_filter' '$all_ids_file'" RETURN
    cat > "$jq_filter" << 'JQEOF'
# Valid enum sets
def valid_statuses: ["backlog","pending","running","completed","failed","verified","waiting_approval","in_progress"];
def valid_thinking: ["none","low","medium","high","ultrathink"];
def valid_reasoning: ["none","minimal","low","medium","high","xhigh"];
def valid_planning: ["skip","lite","spec","full"];
def valid_plan_spec: ["pending","generating","generated","approved","rejected"];

# Helper: check optional field type (absent/null OK, wrong type is error)
def check_opt(field; expected):
    if has(field) then
        if .[field] == null then null
        elif (.[field] | type) == expected then null
        else "Field '\(field)' must be a \(expected) (got: \(.[field] | type))"
        end
    else null end;

# Extract dir_id from input_filename
(input_filename | split("/") | .[-2]) as $dir_id |

# Collect all errors
([
    # Required: id
    (if (.id | type) != "string" or .id == "" then "Missing required field: id"
     elif (.id | test("^((feature|spernakit|audit-[a-z]+)-[0-9]+-[a-zA-Z0-9-]+|remediation(-[0-9]+)?-[a-zA-Z0-9-]+)$") | not)
     then "Invalid 'id' format: '\(.id)' (expected: feature-{timestamp}-{slug}, spernakit-{timestamp}-{slug}, audit-{type}-{timestamp}-{description}, or remediation-({timestamp}-)?{slug})"
     else null end),
    # Required: category, description, title
    (if (.category | type) != "string" or (.category // "") == "" then "Missing required field: category" else null end),
    (if (.description | type) != "string" or (.description // "") == "" then "Missing required field: description" else null end),
    (if has("title") | not then "Missing required field: title"
     elif .title != null and (.title | type) != "string" then "Field 'title' must be a string (got: \(.title | type))"
     else null end),
    # Boolean field checks
    check_opt("titleGenerating"; "boolean"),
    check_opt("passes"; "boolean"),
    check_opt("skipTests"; "boolean"),
    check_opt("requirePlanApproval"; "boolean"),
    # Number field checks
    check_opt("priority"; "number"),
    # Array field checks
    (if has("dependencies") and .dependencies != null then
        if (.dependencies | type) != "array" then "Field 'dependencies' must be an array (got: \(.dependencies | type))"
        elif ([.dependencies[] | select(type != "string")] | length > 0) then "Field 'dependencies' must contain only strings"
        else null end
     else null end),
    # Dependency existence check
    (if (.dependencies | type) == "array" then
        (.dependencies[] | select(. as $d | $all_ids[0] | map(select(. == $d)) | length == 0) | "Dependency '\(.)' does not exist in project")
     else null end),
    (if has("imagePaths") and .imagePaths != null and (.imagePaths | type) != "array" then "Field 'imagePaths' must be an array (got: \(.imagePaths | type))" else null end),
    (if has("textFilePaths") and .textFilePaths != null and (.textFilePaths | type) != "array" then "Field 'textFilePaths' must be an array (got: \(.textFilePaths | type))" else null end),
    (if has("descriptionHistory") and .descriptionHistory != null and (.descriptionHistory | type) != "array" then "Field 'descriptionHistory' must be an array (got: \(.descriptionHistory | type))" else null end),
    # planSpec checks
    (if has("planSpec") and .planSpec != null then
        if (.planSpec | type) != "object" then "Field 'planSpec' must be an object (got: \(.planSpec | type))"
        else null end
     else null end),
    (if .planSpec != null and (.planSpec | type) == "object" then
        (if (.planSpec | has("version")) and (.planSpec.version | type) != "number" then "Field 'planSpec.version' must be a number (got: \(.planSpec.version | type))" else null end),
        (if (.planSpec | has("reviewedByUser")) and (.planSpec.reviewedByUser | type) != "boolean" then "Field 'planSpec.reviewedByUser' must be a boolean (got: \(.planSpec.reviewedByUser | type))" else null end),
        (if (.planSpec | has("tasksCompleted")) and (.planSpec.tasksCompleted | type) != "number" then "Field 'planSpec.tasksCompleted' must be a number (got: \(.planSpec.tasksCompleted | type))" else null end),
        (if (.planSpec | has("tasksTotal")) and (.planSpec.tasksTotal | type) != "number" then "Field 'planSpec.tasksTotal' must be a number (got: \(.planSpec.tasksTotal | type))" else null end)
     else null end),
    # String field checks
    check_opt("spec"; "string"),
    check_opt("model"; "string"),
    check_opt("error"; "string"),
    check_opt("summary"; "string"),
    check_opt("branchName"; "string"),
    check_opt("startedAt"; "string"),
    check_opt("createdAt"; "string"),
    check_opt("updatedAt"; "string"),
    # Enum validations
    (if (.status // "") != "" and (.status | type) == "string" and ([.status] - valid_statuses | length > 0) then "Invalid 'status' value: '\(.status)' (valid: \(valid_statuses | join(" ")))" else null end),
    (if (.thinkingLevel // "") != "" and ([.thinkingLevel] - valid_thinking | length > 0) then "Invalid 'thinkingLevel' value: '\(.thinkingLevel)' (valid: \(valid_thinking | join(" ")))" else null end),
    (if (.reasoningEffort // "") != "" and ([.reasoningEffort] - valid_reasoning | length > 0) then "Invalid 'reasoningEffort' value: '\(.reasoningEffort)' (valid: \(valid_reasoning | join(" ")))" else null end),
    (if (.planningMode // "") != "" and ([.planningMode] - valid_planning | length > 0) then "Invalid 'planningMode' value: '\(.planningMode)' (valid: \(valid_planning | join(" ")))" else null end),
    (if (.planSpec.status // "") != "" and ([.planSpec.status] - valid_plan_spec | length > 0) then "Invalid 'planSpec.status' value: '\(.planSpec.status)' (valid: \(valid_plan_spec | join(" ")))" else null end)
] | map(select(. != null))) as $errors |

if ($errors | length) == 0 then
    "OK\t\($dir_id)\t\(.passes // false)\t\(.status // "")"
else
    "ERR\t\($dir_id)\t\(input_filename)",
    ($errors[] | "ERRMSG\t\(.)"),
    "END\t\($dir_id)"
end
JQEOF

    # Pass 2: Run ALL validation in jq — outputs one line per file:
    #   OK\tdir_id\tpasses\tstatus         (valid file)
    #   ERR\tdir_id\tfile_path\terror_msg   (invalid file, one line per error)
    #   END\tdir_id                         (marks end of a file's errors)
    while IFS=$'\t' read -r tag arg1 arg2 arg3; do
        case "$tag" in
            OK)
                local dir_id="$arg1" passes="$arg2" status="$arg3"
                parsed_files["$dir_id"]=1
                valid_files=$((valid_files + 1))
                if [[ "$passes" == "true" ]]; then
                    echo "  ✅ $dir_id (valid, complete)"
                else
                    echo "  ⬜ $dir_id (valid, not complete)"
                fi
                case "$status" in
                    backlog) status_backlog=$((status_backlog + 1)) ;;
                    pending) status_pending=$((status_pending + 1)) ;;
                    running) status_running=$((status_running + 1)) ;;
                    completed) status_completed=$((status_completed + 1)) ;;
                    failed) status_failed=$((status_failed + 1)) ;;
                    verified) status_verified=$((status_verified + 1)) ;;
                    waiting_approval) status_waiting_approval=$((status_waiting_approval + 1)) ;;
                    in_progress) status_in_progress=$((status_in_progress + 1)) ;;
                    *) status_none=$((status_none + 1)) ;;
                esac
                ;;
            ERR)
                echo "  ❌ $arg1 (invalid)"
                error_details+="❌ $arg1\n"
                error_details+="   File: $arg2\n"
                ;;
            ERRMSG)
                error_details+="  ✗ $arg1\n"
                ;;
            END)
                parsed_files["$arg1"]=1
                invalid_files=$((invalid_files + 1))
                error_details+="\n"
                ;;
        esac
    done < <(jq -r -f "$jq_filter" --slurpfile all_ids "$all_ids_file" "${feature_files[@]}" 2>/dev/null | tr -d '\r')

    # Detect files with invalid JSON (not processed by jq)
    for ff in "${feature_files[@]}"; do
        local fdir=$(dirname "$ff")
        local fid=$(basename "$fdir")
        if [[ -z "${parsed_files[$fid]+isset}" ]]; then
            invalid_files=$((invalid_files + 1))
            echo "  ❌ $fid (invalid)"
            error_details+="❌ $fid\n   File: $ff\n  ✗ Invalid JSON syntax\n\n"
        fi
    done

    # Print summary
    printf "%-20s %s\n" "Total files:" "$total_files"
    printf "%-20s %s\n" "Valid:" "$valid_files"
    printf "%-20s %s\n" "Invalid:" "$invalid_files"
    echo ""
    echo "Status breakdown:"
    [[ $status_backlog -gt 0 ]] && printf "  %-20s %s\n" "backlog:" "$status_backlog"
    [[ $status_pending -gt 0 ]] && printf "  %-20s %s\n" "pending:" "$status_pending"
    [[ $status_running -gt 0 ]] && printf "  %-20s %s\n" "running:" "$status_running"
    [[ $status_completed -gt 0 ]] && printf "  %-20s %s\n" "completed:" "$status_completed"
    [[ $status_failed -gt 0 ]] && printf "  %-20s %s\n" "failed:" "$status_failed"
    [[ $status_verified -gt 0 ]] && printf "  %-20s %s\n" "verified:" "$status_verified"
    [[ $status_waiting_approval -gt 0 ]] && printf "  %-20s %s\n" "waiting_approval:" "$status_waiting_approval"
    [[ $status_in_progress -gt 0 ]] && printf "  %-20s %s\n" "in_progress:" "$status_in_progress"
    [[ $status_none -gt 0 ]] && printf "  %-20s %s\n" "(no status):" "$status_none"
    echo ""

    if [[ $invalid_files -gt 0 ]]; then
        echo "------------------------------------------------------------------------------"
        echo "Validation Errors:"
        echo "------------------------------------------------------------------------------"
        echo ""
        echo -e "$error_details"
        echo "=============================================================================="
        return $EXIT_VALIDATION_ERROR
    else
        echo "✅ All feature.json files are valid!"
        echo ""
        echo "=============================================================================="
        return 0
    fi
}

# -----------------------------------------------------------------------------
# Validate Audit File Exists
# -----------------------------------------------------------------------------
# Usage: validate_audit <audit_name> <script_dir>
# Returns: Audit file path on success (stdout), exit code 0
# On failure: logs error, lists available audits, returns EXIT_NOT_FOUND
validate_audit() {
    local audit_name="$1"
    local script_dir="$2"
    local audits_dir="$script_dir/$DEFAULT_AUDITS_DIR"

    # Normalize audit name (handle with/without .md extension)
    local audit_file_base="${audit_name%.md}"
    local audit_file="$audits_dir/${audit_file_base}.md"

    if [[ ! -f "$audit_file" ]]; then
        log_error "Audit file not found: $audit_file"
        log_info "Available audits:"
        ls -1 "$audits_dir"/*.md 2>/dev/null | xargs -n1 basename | sed 's/\.md$//' | while read -r name; do
            log_info "  - $name"
        done
        return $EXIT_NOT_FOUND
    fi

    echo "$audit_file"
    return 0
}

# -----------------------------------------------------------------------------
# Main Entry Point for Argument Parsing
# -----------------------------------------------------------------------------
# Usage: source lib/args.sh && init_args "$@"
init_args() {
    parse_args "$@"
    apply_defaults
    local result=0
    validate_args || result=$?
    if [[ $result -ne 0 ]]; then
        return $result
    fi
    get_effective_models

    # Handle --status option (display and exit)

    # Handle --extract-batch option (batch extract and exit)
    if [[ "$EXTRACT_BATCH" == true ]]; then
        # Find metadata directory
        local metadata_dir=""
        if [[ -d "$PROJECT_DIR/$DEFAULT_METADATA_DIR" ]]; then
            metadata_dir="$PROJECT_DIR/$DEFAULT_METADATA_DIR"
        else
            log_error "Metadata directory not found: $PROJECT_DIR/$DEFAULT_METADATA_DIR"
            log_info "Run aidd normally first to initialize the project"
            exit $EXIT_NOT_FOUND
        fi

        local iterations_dir="$metadata_dir/$DEFAULT_ITERATIONS_DIR"
        if [[ ! -d "$iterations_dir" ]]; then
            log_error "Iterations directory not found: $iterations_dir"
            exit $EXIT_NOT_FOUND
        fi

        # Source and run extraction
        source "$(dirname "${BASH_SOURCE[0]}")/log-extractor.sh"
        extract_all_logs "$iterations_dir" "$metadata_dir"
        exit $EXIT_SUCCESS
    fi

    # Handle --check-features option (validate and exit)
    if [[ "$CHECK_FEATURES" == true ]]; then
        validate_features "$PROJECT_DIR"
        local validate_result=$?
        exit $validate_result
    fi

    if [[ "$SHOW_STATUS" == true ]]; then
        show_status "$PROJECT_DIR"
        exit $EXIT_SUCCESS
    fi

    # Handle --todo option (export mode flag for use by main script)
    # TODO_MODE is handled by determine_prompt() in lib/iteration.sh
    # We just need to pass through and let iteration.sh handle it

    # Validate --audit option
    if [[ "$AUDIT_MODE" == true ]]; then
        if [[ ${#AUDIT_NAMES[@]} -eq 0 ]]; then
            log_error "Missing audit name. Usage: --audit AUDIT_NAME[,AUDIT_NAME,...]"
            log_info "Example: --audit SECURITY"
            log_info "Example: --audit DEAD_CODE,PERFORMANCE"
            return $EXIT_INVALID_ARGS
        fi
        if [[ ${#AUDIT_NAMES[@]} -gt 1 ]]; then
            log_info "Multiple audits specified: ${AUDIT_NAMES[*]}"
            log_info "Each audit will run sequentially with its own iterations"
        fi
    fi

    # Validate --audit-on-completion audits exist
    if [[ ${#AUDIT_ON_COMPLETION_NAMES[@]} -gt 0 ]]; then
        for aoc_name in "${AUDIT_ON_COMPLETION_NAMES[@]}"; do
            if ! validate_audit "$aoc_name" "$SCRIPT_DIR" >/dev/null; then
                return $EXIT_NOT_FOUND
            fi
        done
        log_info "Post-completion audits configured: ${AUDIT_ON_COMPLETION_NAMES[*]}"
    fi

    # Validate --code-after-audit requires audit context
    if [[ "$CODE_AFTER_AUDIT" == true ]]; then
        if [[ "$AUDIT_MODE" != true && ${#AUDIT_ON_COMPLETION_NAMES[@]} -eq 0 ]]; then
            log_error "--code-after-audit requires --audit or --audit-on-completion"
            return $EXIT_INVALID_ARGS
        fi
        log_info "Code-after-audit enabled: will remediate findings and re-audit until clean"
    fi

    # Log active filter (validation already done in validate_args)
    if [[ -n "$FILTER_BY" ]]; then
        log_info "Feature filter active: $FILTER_BY = $FILTER_VALUE"
    fi

    return 0
}

#!/bin/bash
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
export STOP_WHEN_DONE=false
export AUDIT_MODE=false
export AUDIT_NAME=""
export AUDIT_NAMES=()
export AUDIT_INDEX=0

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
    --stop-when-done      Stop early when TODO/in-progress mode has no remaining items (optional)
    --audit AUDIT[,...]   Run audit mode with one or more audits (e.g., SECURITY or DEAD_CODE,PERFORMANCE)
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
    $0 --project-dir ./myproject --todo --stop-when-done
    $0 --project-dir ./myproject --in-progress --stop-when-done

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
            ((invalid_count++))
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
    local temp_status="/tmp/aidd_status_$$.md"
    {
    echo ""
    echo "=============================================================================="
    echo "Project Feature List Status: $(basename "$project_dir")"
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

    local total_files=0
    local valid_files=0
    local invalid_files=0
    local error_details=""

    # Status counters
    local status_backlog=0
    local status_pending=0
    local status_running=0
    local status_completed=0
    local status_failed=0
    local status_verified=0
    local status_waiting_approval=0
    local status_in_progress=0
    local status_none=0

    # Valid enum values
    local valid_statuses="backlog pending running completed failed verified waiting_approval in_progress"
    local valid_thinking_levels="none low medium high ultrathink"
    local valid_reasoning_efforts="none minimal low medium high xhigh"
    local valid_planning_modes="skip lite spec full"
    local valid_plan_spec_statuses="pending generating generated approved rejected"
    local valid_desc_sources="initial enhance edit"
    local valid_enhancement_modes="improve technical simplify acceptance ux-reviewer"

    # Collect all valid feature IDs for dependency validation
    local all_feature_ids=""
    while IFS= read -r f; do
        [[ -z "$f" || ! -f "$f" ]] && continue
        local fid=$(jq -r '.id // empty' "$f" 2>/dev/null)
        [[ -n "$fid" ]] && all_feature_ids+="$fid "
    done < <(ls -1 "$features_dir"/*/feature.json 2>/dev/null)

    # Use ls with while loop (most reliable on Windows/Git Bash)
    # Single jq call per file for performance (instead of 30+ calls)
    while IFS= read -r feature_file; do
        [[ -z "$feature_file" || ! -f "$feature_file" ]] && continue
        ((total_files++))
        local feature_dir=$(dirname "$feature_file")
        local feature_id=$(basename "$feature_dir")
        local file_errors=""

        # Single jq call to extract all needed values and validate types
        local validation_result
        validation_result=$(jq -r '
            def check_enum($val; $valid): if $val == null then null elif ($valid | index($val)) then null else $val end;
            {
                id: .id,
                id_type: (.id | type),
                category: .category,
                category_type: (.category | type),
                description: .description,
                description_type: (.description | type),
                title_type: (if has("title") then (.title | type) else "absent" end),
                titleGenerating_type: (if has("titleGenerating") then (.titleGenerating | type) else "absent" end),
                passes_type: (if has("passes") then (.passes | type) else "absent" end),
                priority_type: (if has("priority") then (.priority | type) else "absent" end),
                status: .status,
                dependencies_type: (if has("dependencies") then (.dependencies | type) else "absent" end),
                dependencies_invalid: (if (.dependencies | type) == "array" then ([.dependencies[] | select(type != "string")] | length > 0) else false end),
                dependencies_list: (if (.dependencies | type) == "array" then (.dependencies | join(",")) else "" end),
                skipTests_type: (if has("skipTests") then (.skipTests | type) else "absent" end),
                thinkingLevel: .thinkingLevel,
                reasoningEffort: .reasoningEffort,
                planningMode: .planningMode,
                requirePlanApproval_type: (if has("requirePlanApproval") then (.requirePlanApproval | type) else "absent" end),
                planSpec_type: (if has("planSpec") then (.planSpec | type) else "absent" end),
                planSpec_status: .planSpec.status,
                planSpec_version_type: (if .planSpec != null and (.planSpec | has("version")) then (.planSpec.version | type) else "absent" end),
                planSpec_reviewedByUser_type: (if .planSpec != null and (.planSpec | has("reviewedByUser")) then (.planSpec.reviewedByUser | type) else "absent" end),
                planSpec_tasksCompleted_type: (if .planSpec != null and (.planSpec | has("tasksCompleted")) then (.planSpec.tasksCompleted | type) else "absent" end),
                planSpec_tasksTotal_type: (if .planSpec != null and (.planSpec | has("tasksTotal")) then (.planSpec.tasksTotal | type) else "absent" end),
                imagePaths_type: (if has("imagePaths") then (.imagePaths | type) else "absent" end),
                textFilePaths_type: (if has("textFilePaths") then (.textFilePaths | type) else "absent" end),
                descriptionHistory_type: (if has("descriptionHistory") then (.descriptionHistory | type) else "absent" end),
                spec_type: (if has("spec") then (.spec | type) else "absent" end),
                model_type: (if has("model") then (.model | type) else "absent" end),
                error_type: (if has("error") then (.error | type) else "absent" end),
                summary_type: (if has("summary") then (.summary | type) else "absent" end),
                branchName_type: (if has("branchName") then (.branchName | type) else "absent" end),
                startedAt_type: (if has("startedAt") then (.startedAt | type) else "absent" end),
                createdAt_type: (if has("createdAt") then (.createdAt | type) else "absent" end),
                updatedAt_type: (if has("updatedAt") then (.updatedAt | type) else "absent" end)
            } | @json
        ' "$feature_file" 2>/dev/null)

        if [[ -z "$validation_result" || "$validation_result" == "null" ]]; then
            file_errors+="  ✗ Invalid JSON syntax\n"
        else
            # Parse validation result (single jq call to extract all values)
            local id_val id_type category_val desc_val status_val
            local thinkingLevel_val reasoningEffort_val planningMode_val planSpec_status_val

            # Extract values using parameter expansion where possible, jq for complex parsing
            eval "$(echo "$validation_result" | jq -r '
                "id_val=" + (.id // "" | @sh) + "\n" +
                "id_type=" + (.id_type // "" | @sh) + "\n" +
                "category_val=" + (.category // "" | @sh) + "\n" +
                "desc_val=" + (.description // "" | @sh) + "\n" +
                "status_val=" + (.status // "" | @sh) + "\n" +
                "thinkingLevel_val=" + (.thinkingLevel // "" | @sh) + "\n" +
                "reasoningEffort_val=" + (.reasoningEffort // "" | @sh) + "\n" +
                "planningMode_val=" + (.planningMode // "" | @sh) + "\n" +
                "planSpec_status_val=" + (.planSpec_status // "" | @sh) + "\n" +
                "title_type=" + (.title_type // "" | @sh) + "\n" +
                "titleGenerating_type=" + (.titleGenerating_type // "" | @sh) + "\n" +
                "passes_type=" + (.passes_type // "" | @sh) + "\n" +
                "priority_type=" + (.priority_type // "" | @sh) + "\n" +
                "dependencies_type=" + (.dependencies_type // "" | @sh) + "\n" +
                "dependencies_invalid=" + (.dependencies_invalid | tostring | @sh) + "\n" +
                "dependencies_list=" + (.dependencies_list // "" | @sh) + "\n" +
                "skipTests_type=" + (.skipTests_type // "" | @sh) + "\n" +
                "requirePlanApproval_type=" + (.requirePlanApproval_type // "" | @sh) + "\n" +
                "planSpec_type=" + (.planSpec_type // "" | @sh) + "\n" +
                "planSpec_version_type=" + (.planSpec_version_type // "" | @sh) + "\n" +
                "planSpec_reviewedByUser_type=" + (.planSpec_reviewedByUser_type // "" | @sh) + "\n" +
                "planSpec_tasksCompleted_type=" + (.planSpec_tasksCompleted_type // "" | @sh) + "\n" +
                "planSpec_tasksTotal_type=" + (.planSpec_tasksTotal_type // "" | @sh) + "\n" +
                "imagePaths_type=" + (.imagePaths_type // "" | @sh) + "\n" +
                "textFilePaths_type=" + (.textFilePaths_type // "" | @sh) + "\n" +
                "descriptionHistory_type=" + (.descriptionHistory_type // "" | @sh) + "\n" +
                "spec_type=" + (.spec_type // "" | @sh) + "\n" +
                "model_type=" + (.model_type // "" | @sh) + "\n" +
                "error_type=" + (.error_type // "" | @sh) + "\n" +
                "summary_type=" + (.summary_type // "" | @sh) + "\n" +
                "branchName_type=" + (.branchName_type // "" | @sh) + "\n" +
                "startedAt_type=" + (.startedAt_type // "" | @sh) + "\n" +
                "createdAt_type=" + (.createdAt_type // "" | @sh) + "\n" +
                "updatedAt_type=" + (.updatedAt_type // "" | @sh)
            ')"

            # Required field: id
            if [[ -z "$id_val" ]]; then
                file_errors+="  ✗ Missing required field: id\n"
            elif [[ ! "$id_val" =~ ^((feature|audit-[a-z]+)-[0-9]+-[a-zA-Z0-9-]+|remediation(-[0-9]+)?-[a-zA-Z0-9-]+)$ ]]; then
                file_errors+="  ✗ Invalid 'id' format: '$id_val' (expected: feature-{timestamp}-{random}, audit-{type}-{timestamp}-{description}, or remediation-({timestamp}-)?{slug})\n"
            fi

            # Required field: category
            [[ -z "$category_val" ]] && file_errors+="  ✗ Missing required field: category\n"

            # Required field: description
            [[ -z "$desc_val" ]] && file_errors+="  ✗ Missing required field: description\n"

            # Required field: title
            [[ "$title_type" == "absent" ]] && file_errors+="  ✗ Missing required field: title\n"

            # Type checks for optional fields
            [[ "$title_type" != "absent" && "$title_type" != "string" && "$title_type" != "null" ]] && file_errors+="  ✗ Field 'title' must be a string (got: $title_type)\n"
            [[ "$titleGenerating_type" != "absent" && "$titleGenerating_type" != "boolean" ]] && file_errors+="  ✗ Field 'titleGenerating' must be a boolean (got: $titleGenerating_type)\n"
            [[ "$passes_type" != "absent" && "$passes_type" != "boolean" ]] && file_errors+="  ✗ Field 'passes' must be a boolean (got: $passes_type)\n"
            [[ "$priority_type" != "absent" && "$priority_type" != "number" ]] && file_errors+="  ✗ Field 'priority' must be a number (got: $priority_type)\n"
            [[ "$skipTests_type" != "absent" && "$skipTests_type" != "boolean" ]] && file_errors+="  ✗ Field 'skipTests' must be a boolean (got: $skipTests_type)\n"
            [[ "$requirePlanApproval_type" != "absent" && "$requirePlanApproval_type" != "boolean" ]] && file_errors+="  ✗ Field 'requirePlanApproval' must be a boolean (got: $requirePlanApproval_type)\n"

            # Array type checks
            [[ "$dependencies_type" != "absent" && "$dependencies_type" != "array" && "$dependencies_type" != "null" ]] && file_errors+="  ✗ Field 'dependencies' must be an array (got: $dependencies_type)\n"
            [[ "$dependencies_invalid" == "true" ]] && file_errors+="  ✗ Field 'dependencies' must contain only strings\n"

            # Check that each dependency references an existing feature
            if [[ -n "$dependencies_list" && "$dependencies_invalid" != "true" ]]; then
                IFS=',' read -ra dep_array <<< "$dependencies_list"
                for dep in "${dep_array[@]}"; do
                    if [[ ! " $all_feature_ids " =~ " $dep " ]]; then
                        file_errors+="  ✗ Dependency '$dep' does not exist in project\n"
                    fi
                done
            fi

            [[ "$imagePaths_type" != "absent" && "$imagePaths_type" != "array" && "$imagePaths_type" != "null" ]] && file_errors+="  ✗ Field 'imagePaths' must be an array (got: $imagePaths_type)\n"
            [[ "$textFilePaths_type" != "absent" && "$textFilePaths_type" != "array" && "$textFilePaths_type" != "null" ]] && file_errors+="  ✗ Field 'textFilePaths' must be an array (got: $textFilePaths_type)\n"
            [[ "$descriptionHistory_type" != "absent" && "$descriptionHistory_type" != "array" && "$descriptionHistory_type" != "null" ]] && file_errors+="  ✗ Field 'descriptionHistory' must be an array (got: $descriptionHistory_type)\n"

            # planSpec object checks
            [[ "$planSpec_type" != "absent" && "$planSpec_type" != "object" && "$planSpec_type" != "null" ]] && file_errors+="  ✗ Field 'planSpec' must be an object (got: $planSpec_type)\n"
            [[ "$planSpec_version_type" != "absent" && "$planSpec_version_type" != "number" ]] && file_errors+="  ✗ Field 'planSpec.version' must be a number (got: $planSpec_version_type)\n"
            [[ "$planSpec_reviewedByUser_type" != "absent" && "$planSpec_reviewedByUser_type" != "boolean" ]] && file_errors+="  ✗ Field 'planSpec.reviewedByUser' must be a boolean (got: $planSpec_reviewedByUser_type)\n"
            [[ "$planSpec_tasksCompleted_type" != "absent" && "$planSpec_tasksCompleted_type" != "number" ]] && file_errors+="  ✗ Field 'planSpec.tasksCompleted' must be a number (got: $planSpec_tasksCompleted_type)\n"
            [[ "$planSpec_tasksTotal_type" != "absent" && "$planSpec_tasksTotal_type" != "number" ]] && file_errors+="  ✗ Field 'planSpec.tasksTotal' must be a number (got: $planSpec_tasksTotal_type)\n"

            # String field type checks
            [[ "$spec_type" != "absent" && "$spec_type" != "string" && "$spec_type" != "null" ]] && file_errors+="  ✗ Field 'spec' must be a string (got: $spec_type)\n"
            [[ "$model_type" != "absent" && "$model_type" != "string" && "$model_type" != "null" ]] && file_errors+="  ✗ Field 'model' must be a string (got: $model_type)\n"
            [[ "$error_type" != "absent" && "$error_type" != "string" && "$error_type" != "null" ]] && file_errors+="  ✗ Field 'error' must be a string (got: $error_type)\n"
            [[ "$summary_type" != "absent" && "$summary_type" != "string" && "$summary_type" != "null" ]] && file_errors+="  ✗ Field 'summary' must be a string (got: $summary_type)\n"
            [[ "$branchName_type" != "absent" && "$branchName_type" != "string" && "$branchName_type" != "null" ]] && file_errors+="  ✗ Field 'branchName' must be a string (got: $branchName_type)\n"
            [[ "$startedAt_type" != "absent" && "$startedAt_type" != "string" && "$startedAt_type" != "null" ]] && file_errors+="  ✗ Field 'startedAt' must be a string (got: $startedAt_type)\n"
            [[ "$createdAt_type" != "absent" && "$createdAt_type" != "string" && "$createdAt_type" != "null" ]] && file_errors+="  ✗ Field 'createdAt' must be a string (got: $createdAt_type)\n"
            [[ "$updatedAt_type" != "absent" && "$updatedAt_type" != "string" && "$updatedAt_type" != "null" ]] && file_errors+="  ✗ Field 'updatedAt' must be a string (got: $updatedAt_type)\n"

            # Enum validations
            [[ -n "$status_val" && ! " $valid_statuses " =~ " $status_val " ]] && file_errors+="  ✗ Invalid 'status' value: '$status_val' (valid: $valid_statuses)\n"
            [[ -n "$thinkingLevel_val" && ! " $valid_thinking_levels " =~ " $thinkingLevel_val " ]] && file_errors+="  ✗ Invalid 'thinkingLevel' value: '$thinkingLevel_val' (valid: $valid_thinking_levels)\n"
            [[ -n "$reasoningEffort_val" && ! " $valid_reasoning_efforts " =~ " $reasoningEffort_val " ]] && file_errors+="  ✗ Invalid 'reasoningEffort' value: '$reasoningEffort_val' (valid: $valid_reasoning_efforts)\n"
            [[ -n "$planningMode_val" && ! " $valid_planning_modes " =~ " $planningMode_val " ]] && file_errors+="  ✗ Invalid 'planningMode' value: '$planningMode_val' (valid: $valid_planning_modes)\n"
            [[ -n "$planSpec_status_val" && ! " $valid_plan_spec_statuses " =~ " $planSpec_status_val " ]] && file_errors+="  ✗ Invalid 'planSpec.status' value: '$planSpec_status_val' (valid: $valid_plan_spec_statuses)\n"
        fi

        if [[ -n "$file_errors" ]]; then
            ((invalid_files++))
            error_details+="❌ $feature_id\n"
            error_details+="   File: $feature_file\n"
            error_details+="$file_errors\n"
        else
            ((valid_files++))
            # Count by status
            case "$status_val" in
                backlog) ((status_backlog++)) ;;
                pending) ((status_pending++)) ;;
                running) ((status_running++)) ;;
                completed) ((status_completed++)) ;;
                failed) ((status_failed++)) ;;
                verified) ((status_verified++)) ;;
                waiting_approval) ((status_waiting_approval++)) ;;
                in_progress) ((status_in_progress++)) ;;
                *) ((status_none++)) ;;
            esac
        fi

    done < <(ls -1 "$features_dir"/*/feature.json 2>/dev/null)

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
    validate_args
    local result=$?
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

    return 0
}

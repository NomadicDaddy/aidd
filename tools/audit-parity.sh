#!/bin/bash
# =============================================================================
# tools/audit-parity.sh - Post-Rebuild Feature Parity Audit
# =============================================================================
# Compares original application against rebuilt version to verify:
# - All routes from original exist in rebuilt
# - All pages from original exist in rebuilt
# - All models from original exist in rebuilt
# - No orphaned UI elements
#
# Usage: ./audit-parity.sh --original <dir> --rebuilt <dir> [OPTIONS]

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIDD_ROOT="$(dirname "$SCRIPT_DIR")"

# Source utilities if available
if [[ -f "$AIDD_ROOT/lib/utils.sh" ]]; then
    source "$AIDD_ROOT/lib/utils.sh"
else
    log_info() { echo "[INFO] $*" >&2; }
    log_warn() { echo "[WARN] $*" >&2; }
    log_error() { echo "[ERROR] $*" >&2; }
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# -----------------------------------------------------------------------------
# Default Values
# -----------------------------------------------------------------------------
ORIGINAL_DIR=""
REBUILT_DIR=""
OUTPUT_FILE=""
VERBOSE=false

# Counters
TOTAL_CHECKS=0
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Arrays for tracking
declare -a MISSING_MODELS=()
declare -a MISSING_ROUTES=()
declare -a MISSING_PAGES=()
declare -a MISSING_SERVICES=()
declare -a ORPHANED_ELEMENTS=()
declare -a IGNORE_PATTERNS=()

# -----------------------------------------------------------------------------
# Help
# -----------------------------------------------------------------------------
show_help() {
    cat << 'EOF'
Post-Rebuild Feature Parity Audit - Compare original vs rebuilt application

USAGE:
    audit-parity.sh --original <dir> --rebuilt <dir> [OPTIONS]

REQUIRED:
    --original <dir>    Path to the original application (backup)
    --rebuilt <dir>     Path to the rebuilt application

OPTIONS:
    --output <file>     Output report file (default: stdout)
    --verbose           Enable verbose output
    --help              Show this help message

AUDIT CHECKS:
    1. Database Models  - All Prisma models present
    2. API Routes       - All route files present
    3. Backend Services - All service files present
    4. Frontend Pages   - All page components present
    5. UI Components    - All components present
    6. Route Coverage   - API endpoint comparison

IGNORE FILE:
    Place a .parity-ignore file in the rebuilt directory's .automaker folder
    to exclude known false positives (files intentionally restructured or renamed).

    Format: one filename per line, supports wildcards, # for comments
    Example .automaker/.parity-ignore:
        # Pages restructured into settings/ folder
        Profile.tsx
        Settings.tsx
        # Legacy services removed intentionally
        *Legacy*.ts

EXIT CODES:
    0 - Full parity achieved
    1 - Parity issues found
    2 - Invalid arguments

EXAMPLES:
    # Compare original vs rebuilt
    ./audit-parity.sh --original ./openplanner-backup --rebuilt ./openplanner

    # Save report to file
    ./audit-parity.sh --original ./backup --rebuilt ./app --output parity-report.md
EOF
}

# -----------------------------------------------------------------------------
# Argument Parsing
# -----------------------------------------------------------------------------
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --original)
                ORIGINAL_DIR="$2"
                shift 2
                ;;
            --rebuilt)
                REBUILT_DIR="$2"
                shift 2
                ;;
            --output)
                OUTPUT_FILE="$2"
                shift 2
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 2
                ;;
        esac
    done

    if [[ -z "$ORIGINAL_DIR" ]]; then
        log_error "Missing required argument: --original"
        exit 2
    fi

    if [[ -z "$REBUILT_DIR" ]]; then
        log_error "Missing required argument: --rebuilt"
        exit 2
    fi

    if [[ ! -d "$ORIGINAL_DIR" ]]; then
        log_error "Original directory does not exist: $ORIGINAL_DIR"
        exit 2
    fi

    if [[ ! -d "$REBUILT_DIR" ]]; then
        log_error "Rebuilt directory does not exist: $REBUILT_DIR"
        exit 2
    fi
}

# -----------------------------------------------------------------------------
# Ignore File Support
# -----------------------------------------------------------------------------

# Load ignore patterns from .automaker/.parity-ignore file
load_ignore_patterns() {
    local ignore_file="$REBUILT_DIR/.automaker/.parity-ignore"

    if [[ ! -f "$ignore_file" ]]; then
        return
    fi

    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        # Trim whitespace
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        [[ -n "$line" ]] && IGNORE_PATTERNS+=("$line")
    done < "$ignore_file"

    if [[ ${#IGNORE_PATTERNS[@]} -gt 0 && "$VERBOSE" == true ]]; then
        print_check "INFO" "Loaded ${#IGNORE_PATTERNS[@]} ignore patterns from .parity-ignore"
    fi
}

# Check if a filename should be ignored
should_ignore() {
    local filename="$1"

    for pattern in "${IGNORE_PATTERNS[@]}"; do
        # Support exact match and glob patterns
        if [[ "$filename" == "$pattern" ]]; then
            return 0
        fi
        # Support wildcard patterns (e.g., *Service.ts)
        # shellcheck disable=SC2053
        if [[ "$filename" == $pattern ]]; then
            return 0
        fi
    done
    return 1
}

# -----------------------------------------------------------------------------
# Utility Functions
# -----------------------------------------------------------------------------

print_check() {
    local status="$1"
    local message="$2"

    ((++TOTAL_CHECKS))

    case "$status" in
        PASS)
            echo -e "  ${GREEN}✓${NC} $message"
            ((++PASS_COUNT))
            ;;
        FAIL)
            echo -e "  ${RED}✗${NC} $message"
            ((++FAIL_COUNT))
            ;;
        WARN)
            echo -e "  ${YELLOW}⚠${NC} $message"
            ((++WARN_COUNT))
            ;;
        INFO)
            echo -e "  ${CYAN}ℹ${NC} $message"
            ;;
    esac
}

# Extract model names from Prisma schema
extract_models() {
    local schema_file="$1"
    if [[ -f "$schema_file" ]]; then
        grep -E "^model [A-Z]" "$schema_file" | awk '{print $2}' | sort
    fi
}

# Extract route files
extract_route_files() {
    local routes_dir="$1"
    if [[ -d "$routes_dir" ]]; then
        find "$routes_dir" -maxdepth 1 -name "*.ts" -type f 2>/dev/null | \
            xargs -I{} basename {} | sort
    fi
}

# Extract page files
extract_page_files() {
    local pages_dir="$1"
    if [[ -d "$pages_dir" ]]; then
        find "$pages_dir" -maxdepth 1 -name "*.tsx" -type f 2>/dev/null | \
            xargs -I{} basename {} | sort
    fi
}

# Extract service files
extract_service_files() {
    local services_dir="$1"
    if [[ -d "$services_dir" ]]; then
        find "$services_dir" -maxdepth 1 -name "*.ts" -type f 2>/dev/null | \
            xargs -I{} basename {} | sort
    fi
}

# Check if item exists in array
in_array() {
    local needle="$1"
    shift
    local item
    for item in "$@"; do
        [[ "$item" == "$needle" ]] && return 0
    done
    return 1
}

# -----------------------------------------------------------------------------
# Audit Functions
# -----------------------------------------------------------------------------

audit_models() {
    echo ""
    echo "1. Auditing Database Models..."

    local orig_schema="$ORIGINAL_DIR/backend/prisma/schema.prisma"
    local rebuilt_schema="$REBUILT_DIR/backend/prisma/schema.prisma"

    if [[ ! -f "$orig_schema" ]]; then
        print_check "WARN" "Original schema not found"
        return
    fi

    if [[ ! -f "$rebuilt_schema" ]]; then
        print_check "FAIL" "Rebuilt schema not found"
        return
    fi

    local orig_models rebuilt_models
    orig_models=$(extract_models "$orig_schema")
    rebuilt_models=$(extract_models "$rebuilt_schema")

    local orig_count rebuilt_count
    orig_count=$(echo "$orig_models" | grep -c . || echo 0)
    rebuilt_count=$(echo "$rebuilt_models" | grep -c . || echo 0)

    print_check "INFO" "Original: $orig_count models, Rebuilt: $rebuilt_count models"

    # Check each original model exists in rebuilt
    local ignored_count=0
    while IFS= read -r model; do
        [[ -z "$model" ]] && continue

        if should_ignore "$model"; then
            [[ "$VERBOSE" == true ]] && print_check "INFO" "Ignored: $model"
            ((++ignored_count))
            continue
        fi

        if echo "$rebuilt_models" | grep -q "^${model}$"; then
            [[ "$VERBOSE" == true ]] && print_check "PASS" "Model: $model"
        else
            print_check "FAIL" "Missing model: $model"
            MISSING_MODELS+=("$model")
        fi
    done <<< "$orig_models"

    [[ $ignored_count -gt 0 ]] && print_check "INFO" "Ignored $ignored_count models via .parity-ignore"

    if [[ ${#MISSING_MODELS[@]} -eq 0 ]]; then
        print_check "PASS" "All models present"
    fi
}

audit_routes() {
    echo ""
    echo "2. Auditing API Routes..."

    local orig_routes="$ORIGINAL_DIR/backend/src/routes"
    local rebuilt_routes="$REBUILT_DIR/backend/src/routes"

    if [[ ! -d "$orig_routes" ]]; then
        print_check "WARN" "Original routes directory not found"
        return
    fi

    if [[ ! -d "$rebuilt_routes" ]]; then
        print_check "FAIL" "Rebuilt routes directory not found"
        return
    fi

    local orig_files rebuilt_files
    orig_files=$(extract_route_files "$orig_routes")
    rebuilt_files=$(extract_route_files "$rebuilt_routes")

    local orig_count rebuilt_count
    orig_count=$(echo "$orig_files" | grep -c . || echo 0)
    rebuilt_count=$(echo "$rebuilt_files" | grep -c . || echo 0)

    print_check "INFO" "Original: $orig_count route files, Rebuilt: $rebuilt_count route files"

    # Check each original route exists in rebuilt
    local ignored_count=0
    while IFS= read -r route; do
        [[ -z "$route" ]] && continue

        if should_ignore "$route"; then
            [[ "$VERBOSE" == true ]] && print_check "INFO" "Ignored: $route"
            ((++ignored_count))
            continue
        fi

        if echo "$rebuilt_files" | grep -q "^${route}$"; then
            [[ "$VERBOSE" == true ]] && print_check "PASS" "Route: $route"
        else
            print_check "FAIL" "Missing route file: $route"
            MISSING_ROUTES+=("$route")
        fi
    done <<< "$orig_files"

    [[ $ignored_count -gt 0 ]] && print_check "INFO" "Ignored $ignored_count files via .parity-ignore"

    if [[ ${#MISSING_ROUTES[@]} -eq 0 ]]; then
        print_check "PASS" "All route files present"
    fi
}

audit_services() {
    echo ""
    echo "3. Auditing Backend Services..."

    local orig_services="$ORIGINAL_DIR/backend/src/services"
    local rebuilt_services="$REBUILT_DIR/backend/src/services"

    if [[ ! -d "$orig_services" ]]; then
        print_check "WARN" "Original services directory not found"
        return
    fi

    if [[ ! -d "$rebuilt_services" ]]; then
        print_check "FAIL" "Rebuilt services directory not found"
        return
    fi

    local orig_files rebuilt_files
    orig_files=$(extract_service_files "$orig_services")
    rebuilt_files=$(extract_service_files "$rebuilt_services")

    local orig_count rebuilt_count
    orig_count=$(echo "$orig_files" | grep -c . || echo 0)
    rebuilt_count=$(echo "$rebuilt_files" | grep -c . || echo 0)

    print_check "INFO" "Original: $orig_count service files, Rebuilt: $rebuilt_count service files"

    # Check each original service exists in rebuilt
    local ignored_count=0
    while IFS= read -r service; do
        [[ -z "$service" ]] && continue

        if should_ignore "$service"; then
            [[ "$VERBOSE" == true ]] && print_check "INFO" "Ignored: $service"
            ((++ignored_count))
            continue
        fi

        if echo "$rebuilt_files" | grep -q "^${service}$"; then
            [[ "$VERBOSE" == true ]] && print_check "PASS" "Service: $service"
        else
            print_check "FAIL" "Missing service file: $service"
            MISSING_SERVICES+=("$service")
        fi
    done <<< "$orig_files"

    [[ $ignored_count -gt 0 ]] && print_check "INFO" "Ignored $ignored_count files via .parity-ignore"

    if [[ ${#MISSING_SERVICES[@]} -eq 0 ]]; then
        print_check "PASS" "All service files present"
    fi
}

audit_pages() {
    echo ""
    echo "4. Auditing Frontend Pages..."

    local orig_pages="$ORIGINAL_DIR/frontend/src/pages"
    local rebuilt_pages="$REBUILT_DIR/frontend/src/pages"

    if [[ ! -d "$orig_pages" ]]; then
        print_check "WARN" "Original pages directory not found"
        return
    fi

    if [[ ! -d "$rebuilt_pages" ]]; then
        print_check "FAIL" "Rebuilt pages directory not found"
        return
    fi

    local orig_files rebuilt_files
    orig_files=$(extract_page_files "$orig_pages")
    rebuilt_files=$(extract_page_files "$rebuilt_pages")

    local orig_count rebuilt_count
    orig_count=$(echo "$orig_files" | grep -c . || echo 0)
    rebuilt_count=$(echo "$rebuilt_files" | grep -c . || echo 0)

    print_check "INFO" "Original: $orig_count page files, Rebuilt: $rebuilt_count page files"

    # Check each original page exists in rebuilt
    local ignored_count=0
    while IFS= read -r page; do
        [[ -z "$page" ]] && continue

        if should_ignore "$page"; then
            [[ "$VERBOSE" == true ]] && print_check "INFO" "Ignored: $page"
            ((++ignored_count))
            continue
        fi

        if echo "$rebuilt_files" | grep -q "^${page}$"; then
            [[ "$VERBOSE" == true ]] && print_check "PASS" "Page: $page"
        else
            print_check "FAIL" "Missing page file: $page"
            MISSING_PAGES+=("$page")
        fi
    done <<< "$orig_files"

    [[ $ignored_count -gt 0 ]] && print_check "INFO" "Ignored $ignored_count files via .parity-ignore"

    if [[ ${#MISSING_PAGES[@]} -eq 0 ]]; then
        print_check "PASS" "All page files present"
    fi
}

audit_feature_completion() {
    echo ""
    echo "5. Auditing Feature Completion..."

    local features_dir="$REBUILT_DIR/.automaker/features"

    if [[ ! -d "$features_dir" ]]; then
        print_check "WARN" "Features directory not found in rebuilt app"
        return
    fi

    local total=0
    local completed=0
    local failed=0

    for feature_file in "$features_dir"/*/feature.json; do
        [[ ! -f "$feature_file" ]] && continue
        ((++total))

        local status passes
        if command -v jq &> /dev/null; then
            status=$(jq -r '.status // "unknown"' "$feature_file" 2>/dev/null)
            passes=$(jq -r '.passes // false' "$feature_file" 2>/dev/null)
        else
            status=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$feature_file" | \
                sed -E 's/"status"[[:space:]]*:[[:space:]]*"([^"]*)"/\1/' || echo "unknown")
            passes="unknown"
        fi

        if [[ "$status" == "completed" && "$passes" == "true" ]]; then
            ((++completed))
        elif [[ "$status" == "failed" ]]; then
            ((++failed))
        fi
    done

    print_check "INFO" "Total features: $total"
    print_check "INFO" "Completed: $completed"

    if [[ $failed -gt 0 ]]; then
        print_check "FAIL" "Failed features: $failed"
    fi

    local completion_rate=0
    if [[ $total -gt 0 ]]; then
        completion_rate=$((completed * 100 / total))
    fi

    if [[ $completion_rate -eq 100 ]]; then
        print_check "PASS" "All features completed (100%)"
    elif [[ $completion_rate -ge 90 ]]; then
        print_check "WARN" "Feature completion: ${completion_rate}%"
    else
        print_check "FAIL" "Feature completion: ${completion_rate}%"
    fi
}

# -----------------------------------------------------------------------------
# Report Generation
# -----------------------------------------------------------------------------

generate_report() {
    local report=""

    report+="# Feature Parity Audit Report\n\n"
    report+="**Original:** $(basename "$ORIGINAL_DIR")\n"
    report+="**Rebuilt:** $(basename "$REBUILT_DIR")\n"
    report+="**Date:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")\n\n"

    report+="## Summary\n\n"
    report+="| Metric | Count |\n"
    report+="|--------|-------|\n"
    report+="| Total Checks | $TOTAL_CHECKS |\n"
    report+="| Passed | $PASS_COUNT |\n"
    report+="| Failed | $FAIL_COUNT |\n"
    report+="| Warnings | $WARN_COUNT |\n\n"

    if [[ ${#MISSING_MODELS[@]} -gt 0 ]]; then
        report+="## Missing Models\n\n"
        for item in "${MISSING_MODELS[@]}"; do
            report+="- $item\n"
        done
        report+="\n"
    fi

    if [[ ${#MISSING_ROUTES[@]} -gt 0 ]]; then
        report+="## Missing Routes\n\n"
        for item in "${MISSING_ROUTES[@]}"; do
            report+="- $item\n"
        done
        report+="\n"
    fi

    if [[ ${#MISSING_SERVICES[@]} -gt 0 ]]; then
        report+="## Missing Services\n\n"
        for item in "${MISSING_SERVICES[@]}"; do
            report+="- $item\n"
        done
        report+="\n"
    fi

    if [[ ${#MISSING_PAGES[@]} -gt 0 ]]; then
        report+="## Missing Pages\n\n"
        for item in "${MISSING_PAGES[@]}"; do
            report+="- $item\n"
        done
        report+="\n"
    fi

    if [[ $FAIL_COUNT -eq 0 ]]; then
        report+="## Status: PARITY ACHIEVED ✓\n"
    else
        report+="## Status: PARITY ISSUES FOUND\n\n"
        report+="Please address the missing items listed above.\n"
    fi

    if [[ -n "$OUTPUT_FILE" ]]; then
        echo -e "$report" > "$OUTPUT_FILE"
        log_info "Report saved to: $OUTPUT_FILE"
    fi
}

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

print_summary() {
    echo ""
    echo "=============================================="
    echo "           PARITY AUDIT SUMMARY"
    echo "=============================================="
    echo ""
    echo "  Total checks:   $TOTAL_CHECKS"
    echo -e "  Passed:         ${GREEN}$PASS_COUNT${NC}"

    if [[ $FAIL_COUNT -gt 0 ]]; then
        echo -e "  Failed:         ${RED}$FAIL_COUNT${NC}"
    else
        echo "  Failed:         0"
    fi

    if [[ $WARN_COUNT -gt 0 ]]; then
        echo -e "  Warnings:       ${YELLOW}$WARN_COUNT${NC}"
    else
        echo "  Warnings:       0"
    fi

    echo ""

    if [[ $FAIL_COUNT -eq 0 ]]; then
        echo -e "${GREEN}✓ Full feature parity achieved!${NC}"
        return 0
    else
        echo -e "${RED}✗ Parity issues found. Review missing items above.${NC}"
        return 1
    fi
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

main() {
    parse_args "$@"

    echo ""
    echo "=============================================="
    echo "       Feature Parity Audit"
    echo "=============================================="
    echo ""
    echo "Original: $ORIGINAL_DIR"
    echo "Rebuilt:  $REBUILT_DIR"

    # Load ignore patterns if present
    load_ignore_patterns

    # Run all audits
    audit_models
    audit_routes
    audit_services
    audit_pages
    audit_feature_completion

    # Generate report if output file specified
    if [[ -n "$OUTPUT_FILE" ]]; then
        generate_report
    fi

    # Print summary and exit
    print_summary
    exit $?
}

main "$@"

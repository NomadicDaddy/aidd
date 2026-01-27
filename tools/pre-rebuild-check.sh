#!/bin/bash
# =============================================================================
# tools/pre-rebuild-check.sh - Pre-Rebuild Checklist Validator
# =============================================================================
# Validates that all prerequisites are in place before starting AIDD rebuild:
# - DIFFERENTIATION.md exists and is non-empty
# - Feature files exist and are valid
# - No duplicate feature IDs
# - Dependencies resolve correctly
# - Feature count sanity check
#
# Usage: ./pre-rebuild-check.sh --app <app-dir> --original <original-dir> [OPTIONS]

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
APP_DIR=""
ORIGINAL_DIR=""
VERBOSE=false

# Checklist items
declare -A CHECKS
CHECKS[diff_file]=false
CHECKS[diff_content]=false
CHECKS[features_dir]=false
CHECKS[features_exist]=false
CHECKS[features_valid]=false
CHECKS[no_duplicates]=false
CHECKS[deps_resolve]=false
CHECKS[automaker_dir]=false

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# -----------------------------------------------------------------------------
# Help
# -----------------------------------------------------------------------------
show_help() {
    cat << 'EOF'
Pre-Rebuild Checklist - Validate prerequisites before AIDD rebuild

USAGE:
    pre-rebuild-check.sh --app <app-dir> --original <original-dir> [OPTIONS]

REQUIRED:
    --app <dir>         Path to the new application directory (fresh template)
    --original <dir>    Path to the original/backup application directory
                        (contains DIFFERENTIATION.md in docs/)

OPTIONS:
    --verbose           Enable verbose output
    --help              Show this help message

CHECKLIST:
    1. DIFFERENTIATION.md exists (in original)
    2. DIFFERENTIATION.md has content
    3. .automaker/ directory exists (in new app)
    4. .automaker/features/ directory exists
    5. At least one feature file exists
    6. All feature files are valid JSON
    7. No duplicate feature IDs
    8. All dependencies resolve

EXIT CODES:
    0 - All checks pass
    1 - One or more checks failed
    2 - Invalid arguments

EXAMPLES:
    # Check if app is ready for rebuild
    ./pre-rebuild-check.sh --app d:/applications/openplanner --original d:/applications/openplanner.old

    # Verbose mode
    ./pre-rebuild-check.sh --app d:/applications/openplanner --original d:/applications/openplanner.old --verbose
EOF
}

# -----------------------------------------------------------------------------
# Argument Parsing
# -----------------------------------------------------------------------------
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --app)
                APP_DIR="$2"
                shift 2
                ;;
            --original)
                ORIGINAL_DIR="$2"
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

    if [[ -z "$APP_DIR" ]]; then
        log_error "Missing required argument: --app"
        exit 2
    fi

    if [[ -z "$ORIGINAL_DIR" ]]; then
        log_error "Missing required argument: --original"
        exit 2
    fi

    if [[ ! -d "$APP_DIR" ]]; then
        log_error "Application directory does not exist: $APP_DIR"
        exit 2
    fi

    if [[ ! -d "$ORIGINAL_DIR" ]]; then
        log_error "Original directory does not exist: $ORIGINAL_DIR"
        exit 2
    fi
}

# -----------------------------------------------------------------------------
# Check Functions
# -----------------------------------------------------------------------------

print_check() {
    local status="$1"
    local message="$2"

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

check_diff_file() {
    local diff_file="$ORIGINAL_DIR/docs/DIFFERENTIATION.md"

    echo ""
    echo "1. Checking DIFFERENTIATION.md (in original)..."

    if [[ -f "$diff_file" ]]; then
        print_check "PASS" "DIFFERENTIATION.md exists in $ORIGINAL_DIR/docs/"
        CHECKS[diff_file]=true

        # Check content
        local line_count
        line_count=$(wc -l < "$diff_file" 2>/dev/null | awk '{print $1}') || line_count=0
        [[ -z "$line_count" ]] && line_count=0
        if [[ "$line_count" =~ ^[0-9]+$ ]] && [[ "$line_count" -gt 20 ]]; then
            print_check "PASS" "DIFFERENTIATION.md has content ($line_count lines)"
            CHECKS[diff_content]=true
        else
            print_check "WARN" "DIFFERENTIATION.md seems sparse ($line_count lines)"
        fi

        # Count items (handle Windows line endings)
        local item_count
        item_count=$(tr -d '\r' < "$diff_file" | grep -c '^\- \[ \]' 2>/dev/null) || item_count=0
        [[ -z "$item_count" ]] && item_count=0
        print_check "INFO" "Found $item_count items to implement"
    else
        print_check "FAIL" "DIFFERENTIATION.md not found at $ORIGINAL_DIR/docs/DIFFERENTIATION.md"
        print_check "INFO" "Run: diff-template.sh --app $ORIGINAL_DIR --template <template>"
    fi
}

check_automaker_dir() {
    local automaker_dir="$APP_DIR/.automaker"

    echo ""
    echo "2. Checking .automaker/ directory..."

    if [[ -d "$automaker_dir" ]]; then
        print_check "PASS" ".automaker/ directory exists"
        CHECKS[automaker_dir]=true
    else
        print_check "FAIL" ".automaker/ directory not found"
        print_check "INFO" "Will be created during AIDD initialization"
    fi
}

check_features_dir() {
    local features_dir="$APP_DIR/.automaker/features"

    echo ""
    echo "3. Checking features directory..."

    if [[ -d "$features_dir" ]]; then
        print_check "PASS" ".automaker/features/ directory exists"
        CHECKS[features_dir]=true

        # Count features
        local feature_count
        feature_count=$(find "$features_dir" -name "feature.json" 2>/dev/null | wc -l | awk '{print $1}') || feature_count=0
        [[ -z "$feature_count" || ! "$feature_count" =~ ^[0-9]+$ ]] && feature_count=0

        if [[ "$feature_count" -gt 0 ]]; then
            print_check "PASS" "Found $feature_count feature file(s)"
            CHECKS[features_exist]=true
        else
            print_check "FAIL" "No feature files found"
            print_check "INFO" "Run: generate-features.sh --input $ORIGINAL_DIR/docs/DIFFERENTIATION.md --output $APP_DIR/.automaker/features/"
        fi
    else
        print_check "FAIL" ".automaker/features/ directory not found"
    fi
}

check_feature_validity() {
    local features_dir="$APP_DIR/.automaker/features"

    echo ""
    echo "4. Validating feature files..."

    if [[ ! -d "$features_dir" ]]; then
        print_check "FAIL" "Cannot validate: features directory missing"
        return
    fi

    local valid_count=0
    local invalid_count=0
    local total=0

    for feature_file in "$features_dir"/*/feature.json; do
        [[ ! -f "$feature_file" ]] && continue
        ((++total))

        if command -v jq &> /dev/null; then
            if jq empty "$feature_file" 2>/dev/null; then
                ((++valid_count))
            else
                ((++invalid_count))
                [[ "$VERBOSE" == true ]] && print_check "FAIL" "Invalid JSON: $feature_file"
            fi
        else
            # Basic check
            if grep -q '"id"' "$feature_file" && grep -q '"title"' "$feature_file"; then
                ((++valid_count))
            else
                ((++invalid_count))
            fi
        fi
    done

    if [[ $invalid_count -eq 0 && $total -gt 0 ]]; then
        print_check "PASS" "All $total feature files are valid JSON"
        CHECKS[features_valid]=true
    elif [[ $invalid_count -gt 0 ]]; then
        print_check "FAIL" "$invalid_count of $total feature files have invalid JSON"
    else
        print_check "WARN" "No feature files to validate"
    fi
}

check_duplicate_ids() {
    local features_dir="$APP_DIR/.automaker/features"

    echo ""
    echo "5. Checking for duplicate IDs..."

    if [[ ! -d "$features_dir" ]]; then
        print_check "FAIL" "Cannot check: features directory missing"
        return
    fi

    local ids=()
    local duplicates=()

    for feature_file in "$features_dir"/*/feature.json; do
        [[ ! -f "$feature_file" ]] && continue

        local id
        if command -v jq &> /dev/null; then
            id=$(jq -r '.id // empty' "$feature_file" 2>/dev/null)
        else
            id=$(grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' "$feature_file" | \
                sed -E 's/"id"[[:space:]]*:[[:space:]]*"([^"]*)"/\1/')
        fi

        if [[ -n "$id" ]]; then
            # Check for duplicate
            for existing in "${ids[@]}"; do
                if [[ "$existing" == "$id" ]]; then
                    duplicates+=("$id")
                    break
                fi
            done
            ids+=("$id")
        fi
    done

    if [[ ${#duplicates[@]} -eq 0 ]]; then
        print_check "PASS" "No duplicate feature IDs found"
        CHECKS[no_duplicates]=true
    else
        print_check "FAIL" "Found ${#duplicates[@]} duplicate ID(s)"
        for dup in "${duplicates[@]}"; do
            print_check "INFO" "  Duplicate: $dup"
        done
    fi
}

check_dependencies() {
    local features_dir="$APP_DIR/.automaker/features"

    echo ""
    echo "6. Checking dependency resolution..."

    if [[ ! -d "$features_dir" ]]; then
        print_check "FAIL" "Cannot check: features directory missing"
        return
    fi

    # Collect all feature IDs
    local all_ids=()
    for feature_file in "$features_dir"/*/feature.json; do
        [[ ! -f "$feature_file" ]] && continue
        local id
        if command -v jq &> /dev/null; then
            id=$(jq -r '.id // empty' "$feature_file" 2>/dev/null)
        else
            id=$(grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' "$feature_file" | head -1 | \
                sed -E 's/"id"[[:space:]]*:[[:space:]]*"([^"]*)"/\1/')
        fi
        [[ -n "$id" ]] && all_ids+=("$id")
    done

    # Check dependencies
    local missing_deps=()
    for feature_file in "$features_dir"/*/feature.json; do
        [[ ! -f "$feature_file" ]] && continue

        local deps
        if command -v jq &> /dev/null; then
            deps=$(jq -r '.dependencies[]? // empty' "$feature_file" 2>/dev/null)
        else
            continue # Skip dep check without jq
        fi

        while IFS= read -r dep; do
            [[ -z "$dep" ]] && continue

            local found=false
            for existing in "${all_ids[@]}"; do
                if [[ "$existing" == "$dep" ]]; then
                    found=true
                    break
                fi
            done

            if [[ "$found" == false ]]; then
                missing_deps+=("$dep")
            fi
        done <<< "$deps"
    done

    if [[ ${#missing_deps[@]} -eq 0 ]]; then
        print_check "PASS" "All dependencies resolve correctly"
        CHECKS[deps_resolve]=true
    else
        print_check "FAIL" "Found ${#missing_deps[@]} missing dependency reference(s)"
        for dep in "${missing_deps[@]}"; do
            print_check "INFO" "  Missing: $dep"
        done
    fi
}

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

print_summary() {
    local app_name
    app_name=$(basename "$APP_DIR")

    echo ""
    echo "=============================================="
    echo "         PRE-REBUILD CHECK: $app_name"
    echo "=============================================="
    echo ""
    echo "  Checks passed:  $PASS_COUNT"
    echo "  Checks failed:  $FAIL_COUNT"
    echo "  Warnings:       $WARN_COUNT"
    echo ""

    if [[ $FAIL_COUNT -eq 0 ]]; then
        echo -e "${GREEN}✓ Ready for AIDD rebuild!${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Review features in .automaker/features/"
        echo "  2. Run: ./aidd.sh --cli claude-code --project-dir $APP_DIR"
        return 0
    else
        echo -e "${RED}✗ Not ready for rebuild. Please address failures above.${NC}"
        echo ""
        echo "Recommended actions:"

        if [[ "${CHECKS[diff_file]}" == false ]]; then
            echo "  - Generate DIFFERENTIATION.md: ./diff-template.sh --app $ORIGINAL_DIR --template <template>"
        fi

        if [[ "${CHECKS[features_exist]}" == false ]]; then
            echo "  - Generate features: ./generate-features.sh --input $ORIGINAL_DIR/docs/DIFFERENTIATION.md --output $APP_DIR/.automaker/features/"
        fi

        if [[ "${CHECKS[features_valid]}" == false ]]; then
            echo "  - Fix invalid JSON in feature files"
        fi

        if [[ "${CHECKS[deps_resolve]}" == false ]]; then
            echo "  - Fix missing dependencies - run: ./aidd.sh --project-dir <app> --check-features"
        fi

        return 1
    fi
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

main() {
    parse_args "$@"

    local app_name
    app_name=$(basename "$APP_DIR")

    echo ""
    echo "=============================================="
    echo "   Pre-Rebuild Checklist: $app_name"
    echo "=============================================="

    # Run all checks
    check_diff_file
    check_automaker_dir
    check_features_dir
    check_feature_validity
    check_duplicate_ids
    check_dependencies

    # Print summary and exit with appropriate code
    print_summary
    exit $?
}

main "$@"

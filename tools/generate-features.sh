#!/bin/bash
# =============================================================================
# tools/generate-features.sh - Batch Feature Generator for Auto-Rebuild
# =============================================================================
# Parses DIFFERENTIATION.md and generates feature.json files with proper
# IDs, timestamps, dependencies, and template-based specs.
#
# Usage: ./generate-features.sh --input <diff-file> --output <features-dir> [OPTIONS]
#
# Example:
#   ./generate-features.sh --input docs/DIFFERENTIATION.md --output .automaker/features/

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIDD_ROOT="$(dirname "$SCRIPT_DIR")"
TEMPLATES_DIR="$SCRIPT_DIR/templates"

# Source utilities if available
if [[ -f "$AIDD_ROOT/lib/utils.sh" ]]; then
    source "$AIDD_ROOT/lib/utils.sh"
else
    log_info() { echo "[INFO] $*" >&2; }
    log_warn() { echo "[WARN] $*" >&2; }
    log_error() { echo "[ERROR] $*" >&2; }
fi

# -----------------------------------------------------------------------------
# Default Values
# -----------------------------------------------------------------------------
INPUT_FILE=""
OUTPUT_DIR=""
DRY_RUN=false
VERBOSE=false
DATE_PREFIX=""

# Arrays to track what features will be created (for dependency validation)
declare -a MODEL_NAMES=()
declare -a CRUD_NAMES=()

# -----------------------------------------------------------------------------
# Help
# -----------------------------------------------------------------------------
show_help() {
    cat << 'EOF'
Batch Feature Generator - Create feature.json files from DIFFERENTIATION.md

USAGE:
    generate-features.sh --input <file> --output <dir> [OPTIONS]

REQUIRED:
    --input <file>      Path to DIFFERENTIATION.md file
    --output <dir>      Output directory for feature files (.automaker/features/)

OPTIONS:
    --dry-run           Show what would be created without writing files
    --verbose           Enable verbose output
    --help              Show this help message

FEATURE TYPES:
    The generator recognizes items in these sections of DIFFERENTIATION.md:
    - Database Models    → model-feature.json template (priority 1)
    - Backend Services   → service-feature.json template (priority 2)
    - API Routes         → crud-feature.json template (priority 2)
    - Frontend Pages     → page-feature.json template (priority 3)
    - UI Components      → widget-feature.json template (priority 2)
    - Dashboard Widgets  → widget-feature.json template (priority 2)

NAMING CONVENTIONS:
    - Model features: {entity}-model (e.g., backup-model)
    - CRUD features: {entity}-crud (e.g., backup-crud)
    - Page features: {entity}-page (e.g., backups-page)
    - Dependencies auto-detected from naming (only if target exists):
      - {entity}-crud depends on {entity}-model
      - {entity}-page depends on {entity}-crud

EXAMPLES:
    # Generate features from differentiation file
    ./generate-features.sh --input docs/DIFFERENTIATION.md --output .automaker/features/

    # Preview what would be generated
    ./generate-features.sh --input docs/DIFFERENTIATION.md --output .automaker/features/ --dry-run
EOF
}

# -----------------------------------------------------------------------------
# Argument Parsing
# -----------------------------------------------------------------------------
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --input)
                INPUT_FILE="$2"
                shift 2
                ;;
            --output)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
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
                exit 1
                ;;
        esac
    done

    # Validate required arguments
    if [[ -z "$INPUT_FILE" ]]; then
        log_error "Missing required argument: --input"
        exit 1
    fi

    if [[ -z "$OUTPUT_DIR" ]]; then
        log_error "Missing required argument: --output"
        exit 1
    fi

    if [[ ! -f "$INPUT_FILE" ]]; then
        log_error "Input file does not exist: $INPUT_FILE"
        exit 1
    fi

    # Set date prefix for feature IDs
    DATE_PREFIX=$(date +"%Y%m%d")
}

# -----------------------------------------------------------------------------
# Utility Functions
# -----------------------------------------------------------------------------

# Convert to lowercase with hyphens
to_kebab_case() {
    echo "$1" | sed -E 's/([A-Z])/-\L\1/g' | sed 's/^-//' | tr '[:upper:]' '[:lower:]'
}

# Convert to lowercase
to_lower() {
    echo "$1" | tr '[:upper:]' '[:lower:]'
}

# Generate timestamp
get_timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%S.000Z"
}

# Generate feature ID
generate_feature_id() {
    local name="$1"
    echo "feature-${DATE_PREFIX}-${name}"
}

# Check if a model feature will be created
model_exists() {
    local name="$1"
    local m
    for m in "${MODEL_NAMES[@]}"; do
        [[ "$m" == "$name" ]] && return 0
    done
    return 1
}

# Check if a CRUD feature will be created
crud_exists() {
    local name="$1"
    local c
    for c in "${CRUD_NAMES[@]}"; do
        [[ "$c" == "$name" ]] && return 0
    done
    return 1
}

# Read template file
read_template() {
    local template_name="$1"
    local template_file="$TEMPLATES_DIR/${template_name}.json"

    if [[ ! -f "$template_file" ]]; then
        log_error "Template not found: $template_file"
        return 1
    fi

    cat "$template_file"
}

# Replace placeholders in template
apply_template() {
    local template="$1"
    local entity="$2"
    local description="${3:-}"
    local feature_id="${4:-}"
    local timestamp="${5:-}"
    local model_dep="${6:-}"
    local crud_dep="${7:-}"

    local entity_lower entity_plural_lower
    entity_lower=$(to_kebab_case "$entity")
    entity_plural_lower="${entity_lower}s"

    echo "$template" | sed \
        -e "s/{{ENTITY}}/${entity}/g" \
        -e "s/{{ENTITY_LOWER}}/${entity_lower}/g" \
        -e "s/{{ENTITY_PLURAL_LOWER}}/${entity_plural_lower}/g" \
        -e "s/{{DESCRIPTION}}/${description}/g" \
        -e "s/{{FEATURE_ID}}/${feature_id}/g" \
        -e "s/{{TIMESTAMP}}/${timestamp}/g" \
        -e "s/{{MODEL_DEPENDENCY}}/${model_dep}/g" \
        -e "s/{{CRUD_DEPENDENCY}}/${crud_dep}/g" \
        -e "s/{{WIDGET}}/${entity}/g" \
        -e "s/{{SERVICE}}/${entity}/g" \
        -e "s/{{SERVICE_LOWER}}/${entity_lower}/g"
}

# Create feature directory and file
create_feature() {
    local feature_id="$1"
    local content="$2"

    local feature_dir="$OUTPUT_DIR/$feature_id"
    local feature_file="$feature_dir/feature.json"

    # Skip if feature already exists (don't overwrite template features)
    if [[ -f "$feature_file" ]]; then
        [[ "$VERBOSE" == true ]] && log_info "Skipping existing: $feature_file"
        return 1  # Return 1 to indicate skipped (not counted)
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would create: $feature_file"
        [[ "$VERBOSE" == true ]] && echo "$content" | head -5
        return 0
    fi

    mkdir -p "$feature_dir"
    echo "$content" > "$feature_file"
    log_info "Created: $feature_file"
    return 0
}

# -----------------------------------------------------------------------------
# Parsing Functions
# -----------------------------------------------------------------------------

# Parse section and extract items
# Items are lines starting with "- [ ]" followed by **Name**
parse_section() {
    local section_name="$1"
    local content="$2"

    # Extract section content between headers
    local section_content
    section_content=$(echo "$content" | \
        sed -n "/^## ${section_name}/,/^## /p")

    # Extract items: - [ ] **Name** - description
    echo "$section_content" | \
        grep -E '^\- \[ \] \*\*' | \
        sed -E 's/^\- \[ \] \*\*([^*]+)\*\*.*/\1/' | \
        tr -d '\r' || true
}

# -----------------------------------------------------------------------------
# Pre-scan Functions (build dependency lookup tables)
# -----------------------------------------------------------------------------

# Build list of model names that will be created
build_model_list() {
    local items="$1"

    while IFS= read -r item; do
        [[ -z "$item" ]] && continue
        local model_name
        model_name=$(to_kebab_case "$item")-model
        MODEL_NAMES+=("$model_name")
    done <<< "$items"
}

# Build list of CRUD names that will be created
build_crud_list() {
    local items="$1"

    while IFS= read -r item; do
        [[ -z "$item" ]] && continue
        local route="$item"
        route="${route%Routes}"
        route="${route%routes}"
        local crud_name
        crud_name=$(to_kebab_case "$route")-crud
        CRUD_NAMES+=("$crud_name")
    done <<< "$items"
}

# -----------------------------------------------------------------------------
# Feature Generation
# -----------------------------------------------------------------------------

generate_model_features() {
    local items="$1"
    local timestamp
    timestamp=$(get_timestamp)
    local count=0

    while IFS= read -r item; do
        [[ -z "$item" ]] && continue

        local entity="$item"
        local feature_name
        feature_name=$(to_kebab_case "$entity")-model
        local feature_id
        feature_id=$(generate_feature_id "$feature_name")

        local template
        template=$(read_template "model-feature")
        local content
        content=$(apply_template "$template" "$entity" "data storage" "$feature_id" "$timestamp")

        create_feature "$feature_name" "$content" && ((++count))
    done <<< "$items"

    echo "$count"
}

generate_service_features() {
    local items="$1"
    local timestamp
    timestamp=$(get_timestamp)
    local count=0

    while IFS= read -r item; do
        [[ -z "$item" ]] && continue

        local service="$item"
        # Remove 'Service' suffix if present
        service="${service%Service}"
        service="${service%service}"

        local feature_name
        feature_name=$(to_kebab_case "$service")-service
        local feature_id
        feature_id=$(generate_feature_id "$feature_name")

        local template
        template=$(read_template "service-feature")
        local content
        content=$(apply_template "$template" "$service" "business logic" "$feature_id" "$timestamp")

        create_feature "$feature_name" "$content" && ((++count))
    done <<< "$items"

    echo "$count"
}

generate_crud_features() {
    local items="$1"
    local timestamp
    timestamp=$(get_timestamp)
    local count=0

    while IFS= read -r item; do
        [[ -z "$item" ]] && continue

        local route="$item"
        # Remove 'Routes' suffix if present
        route="${route%Routes}"
        route="${route%routes}"

        local entity_lower
        entity_lower=$(to_kebab_case "$route")
        local feature_name="${entity_lower}-crud"
        local feature_id
        feature_id=$(generate_feature_id "$feature_name")

        # Model dependency - only if model exists
        local model_dep=""
        local model_name="${entity_lower}-model"
        if model_exists "$model_name"; then
            model_dep=$(generate_feature_id "$model_name")
        fi

        local template
        template=$(read_template "crud-feature")
        local content
        content=$(apply_template "$template" "$route" "" "$feature_id" "$timestamp" "$model_dep")

        create_feature "$feature_name" "$content" && ((++count))
    done <<< "$items"

    echo "$count"
}

generate_page_features() {
    local items="$1"
    local timestamp
    timestamp=$(get_timestamp)
    local count=0

    while IFS= read -r item; do
        [[ -z "$item" ]] && continue

        local page="$item"
        local entity_lower
        entity_lower=$(to_kebab_case "$page")
        local feature_name="${entity_lower}-page"
        local feature_id
        feature_id=$(generate_feature_id "$feature_name")

        # CRUD dependency - only if CRUD exists
        local crud_dep=""
        local crud_name="${entity_lower}-crud"
        if crud_exists "$crud_name"; then
            crud_dep=$(generate_feature_id "$crud_name")
        fi

        local template
        template=$(read_template "page-feature")
        local content
        content=$(apply_template "$template" "$page" "" "$feature_id" "$timestamp" "" "$crud_dep")

        create_feature "$feature_name" "$content" && ((++count))
    done <<< "$items"

    echo "$count"
}

generate_widget_features() {
    local items="$1"
    local timestamp
    timestamp=$(get_timestamp)
    local count=0

    while IFS= read -r item; do
        [[ -z "$item" ]] && continue

        local widget="$item"
        local feature_name
        feature_name=$(to_kebab_case "$widget")-widget
        local feature_id
        feature_id=$(generate_feature_id "$feature_name")

        local template
        template=$(read_template "widget-feature")
        local content
        content=$(apply_template "$template" "$widget" "dashboard visualization" "$feature_id" "$timestamp")

        create_feature "$feature_name" "$content" && ((++count))
    done <<< "$items"

    echo "$count"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

main() {
    parse_args "$@"

    log_info "Parsing: $INPUT_FILE"
    log_info "Output: $OUTPUT_DIR"
    [[ "$DRY_RUN" == true ]] && log_info "Mode: DRY-RUN (no files will be created)"

    # Create output directory
    if [[ "$DRY_RUN" == false ]]; then
        mkdir -p "$OUTPUT_DIR"
    fi

    # Read input file (strip Windows line endings)
    local content
    content=$(cat "$INPUT_FILE" | tr -d '\r')

    # Parse each section
    local models services routes pages components widgets

    models=$(parse_section "Database Models" "$content")
    services=$(parse_section "Backend Services" "$content")
    routes=$(parse_section "API Routes" "$content")
    pages=$(parse_section "Frontend Pages" "$content")
    components=$(parse_section "UI Components" "$content")
    widgets=$(parse_section "Dashboard Widgets" "$content")

    # Pre-scan: build lookup tables for dependency validation
    build_model_list "$models"
    build_crud_list "$routes"

    [[ "$VERBOSE" == true ]] && log_info "Found ${#MODEL_NAMES[@]} models, ${#CRUD_NAMES[@]} CRUD routes"

    # Generate features
    local total=0
    local count

    log_info "Generating model features..."
    count=$(generate_model_features "$models")
    total=$((total + count))

    log_info "Generating service features..."
    count=$(generate_service_features "$services")
    total=$((total + count))

    log_info "Generating CRUD features..."
    count=$(generate_crud_features "$routes")
    total=$((total + count))

    log_info "Generating page features..."
    count=$(generate_page_features "$pages")
    total=$((total + count))

    log_info "Generating component features..."
    count=$(generate_widget_features "$components")
    total=$((total + count))

    log_info "Generating widget features..."
    count=$(generate_widget_features "$widgets")
    total=$((total + count))

    echo ""
    log_info "Generated $total feature files."
}

main "$@"

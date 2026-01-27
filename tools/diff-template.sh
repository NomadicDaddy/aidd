#!/bin/bash
# =============================================================================
# tools/diff-template.sh - Template Diff Analyzer for Auto-Rebuild
# =============================================================================
# Compares a derived application against the spernakit template to identify
# differentiating features (custom models, routes, pages, services).
#
# Usage: ./diff-template.sh --app <app-dir> --template <template-dir> [--output <file>]
#
# Example:
#   ./diff-template.sh --app d:/applications/openplanner --template d:/applications/spernakit
#
# Output: Generates a structured DIFFERENTIATION.md file categorizing custom features

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
    # Minimal fallback logging
    log_info() { echo "[INFO] $*" >&2; }
    log_warn() { echo "[WARN] $*" >&2; }
    log_error() { echo "[ERROR] $*" >&2; }
fi

# -----------------------------------------------------------------------------
# Default Values
# -----------------------------------------------------------------------------
APP_DIR=""
TEMPLATE_DIR=""
OUTPUT_FILE=""
VERBOSE=false

# Template base models (from spernakit schema.prisma)
TEMPLATE_MODELS=(
    "AuditLog"
    "HealthCheckAlert"
    "HealthCheckLog"
    "Notification"
    "UserNotificationPreference"
    "Setting"
    "SystemMetric"
    "User"
    "ScheduledTaskExecution"
)

# Template base routes (from spernakit)
TEMPLATE_ROUTES=(
    "authRoutes"
    "userRoutes"
    "notificationRoutes"
    "settingsRoutes"
    "healthRoutes"
    "auditRoutes"
)

# Template base pages (from spernakit)
TEMPLATE_PAGES=(
    "Dashboard"
    "Login"
    "Settings"
    "Users"
    "Profile"
    "NotFound"
    "AuditLogs"
)

# -----------------------------------------------------------------------------
# Help
# -----------------------------------------------------------------------------
show_help() {
    cat << 'EOF'
Template Diff Analyzer - Identify differentiating features for auto-rebuild

USAGE:
    diff-template.sh --app <app-dir> --template <template-dir> [OPTIONS]

REQUIRED:
    --app <dir>         Path to the derived application
    --template <dir>    Path to the spernakit template

OPTIONS:
    --output <file>     Output file path (default: <app>/docs/DIFFERENTIATION.md)
    --verbose           Enable verbose output
    --help              Show this help message

EXAMPLES:
    # Analyze openplanner against spernakit template
    ./diff-template.sh --app d:/applications/openplanner --template d:/applications/spernakit

    # Output to custom location
    ./diff-template.sh --app ./myapp --template ./spernakit --output ./diff-report.md

OUTPUT:
    Generates a categorized markdown file listing:
    - Database Models (custom Prisma models)
    - Backend Services (custom services)
    - API Routes (custom route files)
    - Frontend Pages (custom page components)
    - UI Components (custom reusable components)
    - Dashboard Widgets (custom dashboard elements)
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
            --template)
                TEMPLATE_DIR="$2"
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
                exit 1
                ;;
        esac
    done

    # Validate required arguments
    if [[ -z "$APP_DIR" ]]; then
        log_error "Missing required argument: --app"
        exit 1
    fi

    if [[ -z "$TEMPLATE_DIR" ]]; then
        log_error "Missing required argument: --template"
        exit 1
    fi

    # Validate directories exist
    if [[ ! -d "$APP_DIR" ]]; then
        log_error "Application directory does not exist: $APP_DIR"
        exit 1
    fi

    if [[ ! -d "$TEMPLATE_DIR" ]]; then
        log_error "Template directory does not exist: $TEMPLATE_DIR"
        exit 1
    fi

    # Set default output file
    if [[ -z "$OUTPUT_FILE" ]]; then
        OUTPUT_FILE="$APP_DIR/docs/DIFFERENTIATION.md"
    fi
}

# -----------------------------------------------------------------------------
# Utility Functions
# -----------------------------------------------------------------------------

# Check if a value is in an array
in_array() {
    local needle="$1"
    shift
    local item
    for item in "$@"; do
        [[ "$item" == "$needle" ]] && return 0
    done
    return 1
}

# Extract model names from Prisma schema
extract_prisma_models() {
    local schema_file="$1"
    if [[ -f "$schema_file" ]]; then
        grep -E "^model [A-Z]" "$schema_file" | awk '{print $2}' | sort
    fi
}

# Extract route file names
extract_routes() {
    local routes_dir="$1"
    if [[ -d "$routes_dir" ]]; then
        find "$routes_dir" -name "*Routes.ts" -o -name "*routes.ts" 2>/dev/null | \
            xargs -I{} basename {} .ts | sort
    fi
}

# Extract page names from pages directory
extract_pages() {
    local pages_dir="$1"
    if [[ -d "$pages_dir" ]]; then
        find "$pages_dir" -maxdepth 1 -name "*.tsx" 2>/dev/null | \
            xargs -I{} basename {} .tsx | sort
    fi
}

# Extract service file names
extract_services() {
    local services_dir="$1"
    if [[ -d "$services_dir" ]]; then
        find "$services_dir" -maxdepth 1 -name "*Service.ts" -o -name "*service.ts" 2>/dev/null | \
            xargs -I{} basename {} .ts | sort
    fi
}

# Extract component names
extract_components() {
    local components_dir="$1"
    if [[ -d "$components_dir" ]]; then
        find "$components_dir" -maxdepth 2 -type d 2>/dev/null | \
            while read -r dir; do
                if [[ -f "$dir/index.tsx" ]] || [[ -f "$dir/index.ts" ]]; then
                    basename "$dir"
                fi
            done | sort
    fi
}

# -----------------------------------------------------------------------------
# Analysis Functions
# -----------------------------------------------------------------------------

analyze_models() {
    log_info "Analyzing database models..."

    local app_schema="$APP_DIR/backend/prisma/schema.prisma"
    local template_schema="$TEMPLATE_DIR/backend/prisma/schema.prisma"

    local custom_models=()

    if [[ -f "$app_schema" ]]; then
        while IFS= read -r model; do
            if ! in_array "$model" "${TEMPLATE_MODELS[@]}"; then
                custom_models+=("$model")
                [[ "$VERBOSE" == true ]] && log_info "  Custom model: $model"
            fi
        done < <(extract_prisma_models "$app_schema")
    fi

    echo "${custom_models[@]}"
}

analyze_routes() {
    log_info "Analyzing API routes..."

    local app_routes="$APP_DIR/backend/src/routes"
    local custom_routes=()

    if [[ -d "$app_routes" ]]; then
        while IFS= read -r route; do
            if ! in_array "$route" "${TEMPLATE_ROUTES[@]}"; then
                custom_routes+=("$route")
                [[ "$VERBOSE" == true ]] && log_info "  Custom route: $route"
            fi
        done < <(extract_routes "$app_routes")
    fi

    echo "${custom_routes[@]}"
}

analyze_services() {
    log_info "Analyzing backend services..."

    local app_services="$APP_DIR/backend/src/services"
    local template_services="$TEMPLATE_DIR/backend/src/services"

    local custom_services=()
    local template_service_list=()

    # Get template services
    if [[ -d "$template_services" ]]; then
        while IFS= read -r svc; do
            template_service_list+=("$svc")
        done < <(extract_services "$template_services")
    fi

    # Find custom services
    if [[ -d "$app_services" ]]; then
        while IFS= read -r svc; do
            if ! in_array "$svc" "${template_service_list[@]}"; then
                custom_services+=("$svc")
                [[ "$VERBOSE" == true ]] && log_info "  Custom service: $svc"
            fi
        done < <(extract_services "$app_services")
    fi

    echo "${custom_services[@]}"
}

analyze_pages() {
    log_info "Analyzing frontend pages..."

    local app_pages="$APP_DIR/frontend/src/pages"
    local custom_pages=()

    if [[ -d "$app_pages" ]]; then
        while IFS= read -r page; do
            if ! in_array "$page" "${TEMPLATE_PAGES[@]}"; then
                custom_pages+=("$page")
                [[ "$VERBOSE" == true ]] && log_info "  Custom page: $page"
            fi
        done < <(extract_pages "$app_pages")
    fi

    echo "${custom_pages[@]}"
}

analyze_components() {
    log_info "Analyzing UI components..."

    local app_components="$APP_DIR/frontend/src/components"
    local template_components="$TEMPLATE_DIR/frontend/src/components"

    local custom_components=()
    local template_component_list=()

    # Get template components
    if [[ -d "$template_components" ]]; then
        while IFS= read -r comp; do
            template_component_list+=("$comp")
        done < <(extract_components "$template_components")
    fi

    # Find custom components
    if [[ -d "$app_components" ]]; then
        while IFS= read -r comp; do
            if ! in_array "$comp" "${template_component_list[@]}"; then
                custom_components+=("$comp")
                [[ "$VERBOSE" == true ]] && log_info "  Custom component: $comp"
            fi
        done < <(extract_components "$app_components")
    fi

    echo "${custom_components[@]}"
}

# -----------------------------------------------------------------------------
# Output Generation
# -----------------------------------------------------------------------------

generate_output() {
    local models=($1)
    local routes=($2)
    local services=($3)
    local pages=($4)
    local components=($5)

    local app_name
    app_name=$(basename "$APP_DIR")

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Ensure output directory exists
    mkdir -p "$(dirname "$OUTPUT_FILE")"

    cat > "$OUTPUT_FILE" << EOF
# ${app_name} - Differentiation from Spernakit Template

> Auto-generated by diff-template.sh on ${timestamp}
> Template: $(basename "$TEMPLATE_DIR")
> Application: ${app_name}

This document inventories the features and functionality that differentiate
${app_name} from the base spernakit template. Use this as a guide for
rebuilding the application on a fresh template copy.

---

## Database Models

Custom Prisma models added beyond the template base:

EOF

    if [[ ${#models[@]} -gt 0 && -n "${models[0]}" ]]; then
        for model in "${models[@]}"; do
            echo "- [ ] **${model}** - [describe purpose]" >> "$OUTPUT_FILE"
        done
    else
        echo "_No custom models detected._" >> "$OUTPUT_FILE"
    fi

    cat >> "$OUTPUT_FILE" << 'EOF'

---

## Backend Services

Custom service files for business logic:

EOF

    if [[ ${#services[@]} -gt 0 && -n "${services[0]}" ]]; then
        for svc in "${services[@]}"; do
            echo "- [ ] **${svc}** - [describe purpose]" >> "$OUTPUT_FILE"
        done
    else
        echo "_No custom services detected._" >> "$OUTPUT_FILE"
    fi

    cat >> "$OUTPUT_FILE" << 'EOF'

---

## API Routes

Custom API route files:

EOF

    if [[ ${#routes[@]} -gt 0 && -n "${routes[0]}" ]]; then
        for route in "${routes[@]}"; do
            echo "- [ ] **${route}** - [describe endpoints]" >> "$OUTPUT_FILE"
        done
    else
        echo "_No custom routes detected._" >> "$OUTPUT_FILE"
    fi

    cat >> "$OUTPUT_FILE" << 'EOF'

---

## Frontend Pages

Custom page components:

EOF

    if [[ ${#pages[@]} -gt 0 && -n "${pages[0]}" ]]; then
        for page in "${pages[@]}"; do
            echo "- [ ] **${page}** - [describe functionality]" >> "$OUTPUT_FILE"
        done
    else
        echo "_No custom pages detected._" >> "$OUTPUT_FILE"
    fi

    cat >> "$OUTPUT_FILE" << 'EOF'

---

## UI Components

Custom reusable UI components:

EOF

    if [[ ${#components[@]} -gt 0 && -n "${components[0]}" ]]; then
        for comp in "${components[@]}"; do
            echo "- [ ] **${comp}** - [describe purpose]" >> "$OUTPUT_FILE"
        done
    else
        echo "_No custom components detected._" >> "$OUTPUT_FILE"
    fi

    cat >> "$OUTPUT_FILE" << 'EOF'

---

## Dashboard Widgets

Custom dashboard widgets and visualizations:

- [ ] [Add dashboard widgets manually]

---

## Configuration/Settings

Custom configuration or settings extensions:

- [ ] [Add custom settings manually]

---

## Integrations

External service integrations:

- [ ] [Add integrations manually]

---

## Notes

- Review each item and fill in the description placeholders
- Check items off as you create corresponding feature files
- Add any missed items discovered during manual review
- Dependencies between features should be noted in feature files
EOF

    log_info "Generated: $OUTPUT_FILE"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

main() {
    parse_args "$@"

    log_info "Analyzing application: $APP_DIR"
    log_info "Against template: $TEMPLATE_DIR"
    echo ""

    # Run analysis
    local models routes services pages components

    models=$(analyze_models)
    routes=$(analyze_routes)
    services=$(analyze_services)
    pages=$(analyze_pages)
    components=$(analyze_components)

    echo ""
    log_info "Analysis complete."
    log_info "  Models: $(echo "$models" | wc -w)"
    log_info "  Routes: $(echo "$routes" | wc -w)"
    log_info "  Services: $(echo "$services" | wc -w)"
    log_info "  Pages: $(echo "$pages" | wc -w)"
    log_info "  Components: $(echo "$components" | wc -w)"
    echo ""

    # Generate output
    generate_output "$models" "$routes" "$services" "$pages" "$components"

    log_info "Done. Review and refine: $OUTPUT_FILE"
}

main "$@"

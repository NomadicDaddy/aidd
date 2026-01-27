#!/bin/bash
# =============================================================================
# generate-changelog.sh - Generate Changelog from Completed Features
# =============================================================================
# Generates a proper CHANGELOG.md for rebuilt applications by:
# - Scanning .automaker/features/ for completed features
# - Excluding template-default and audit features
# - Calculating per-feature version bumps
# - Producing changelog entries in Keep a Changelog format
#
# Usage: ./generate-changelog.sh --project-dir <app-directory> [OPTIONS]

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIDD_ROOT="$(dirname "$SCRIPT_DIR")"

# Source shared utilities
source "$AIDD_ROOT/lib/utils.sh"

# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------

# Default spernakit template location
DEFAULT_TEMPLATE_DIR="d:/applications/spernakit"

# Category to version bump mapping
# minor = new functionality, patch = improvements/fixes
declare -A CATEGORY_BUMP
CATEGORY_BUMP["Database"]="minor"
CATEGORY_BUMP["Backend"]="minor"
CATEGORY_BUMP["Frontend"]="minor"
CATEGORY_BUMP["Core"]="minor"
CATEGORY_BUMP["Security"]="minor"
CATEGORY_BUMP["Data"]="minor"
CATEGORY_BUMP["Backup"]="minor"
CATEGORY_BUMP["UI"]="patch"
CATEGORY_BUMP["Dashboard"]="patch"
CATEGORY_BUMP["Performance"]="patch"
CATEGORY_BUMP["DevEx"]="patch"
CATEGORY_BUMP["Development"]="patch"
CATEGORY_BUMP["Error Handling"]="patch"
CATEGORY_BUMP["Bugfix"]="patch"
CATEGORY_BUMP["Infrastructure"]="patch"
CATEGORY_BUMP["Uncategorized"]="patch"

# Category to changelog section mapping
declare -A CATEGORY_SECTION
CATEGORY_SECTION["Database"]="Added"
CATEGORY_SECTION["Backend"]="Added"
CATEGORY_SECTION["Frontend"]="Added"
CATEGORY_SECTION["Core"]="Added"
CATEGORY_SECTION["Security"]="Added"
CATEGORY_SECTION["Data"]="Added"
CATEGORY_SECTION["Backup"]="Added"
CATEGORY_SECTION["UI"]="Changed"
CATEGORY_SECTION["Dashboard"]="Changed"
CATEGORY_SECTION["Performance"]="Changed"
CATEGORY_SECTION["DevEx"]="Changed"
CATEGORY_SECTION["Development"]="Changed"
CATEGORY_SECTION["Error Handling"]="Fixed"
CATEGORY_SECTION["Bugfix"]="Fixed"
CATEGORY_SECTION["Infrastructure"]="Changed"
CATEGORY_SECTION["Uncategorized"]="Changed"

# -----------------------------------------------------------------------------
# Default Values
# -----------------------------------------------------------------------------
PROJECT_DIR=""
TEMPLATE_DIR=""
OUTPUT_FILE=""
BASE_VERSION=""
DRY_RUN=false
VERBOSE=false
UPDATE_PACKAGE_JSON=true
GROUP_BY="vertical"  # "vertical" (default), "feature", or "day"

# Template feature cache (populated at runtime)
declare -A TEMPLATE_FEATURES

# -----------------------------------------------------------------------------
# Help
# -----------------------------------------------------------------------------
show_help() {
    cat << 'EOF'
Generate Changelog - Create changelog from completed AIDD features

USAGE:
    generate-changelog.sh --project-dir <app-directory> [OPTIONS]

REQUIRED:
    --project-dir <dir>     Path to the application directory

OPTIONS:
    --template-dir <dir>    Path to spernakit template (default: d:/applications/spernakit)
                            Used to identify and exclude template-default features
    --output <path>         Output file path (default: docs/CHANGELOG.md)
    --base-version <ver>    Base version to start from (default: read from spernakit_version)
    --group-by <mode>       Grouping mode: "vertical" (default), "feature", or "day"
                            - vertical: features grouped by domain (License, Backup, etc.)
                            - feature: each feature gets its own version bump
                            - day: features on same day grouped into one version
    --no-update-version     Don't update package.json version
    --dry-run               Preview output without writing files
    --verbose               Enable verbose output
    --help                  Show this help message

EXAMPLES:
    # Generate changelog for groundtruth
    ./generate-changelog.sh --project-dir d:/applications/groundtruth

    # Preview without writing
    ./generate-changelog.sh --project-dir d:/applications/groundtruth --dry-run

    # Custom template location
    ./generate-changelog.sh --project-dir d:/applications/groundtruth --template-dir /path/to/spernakit

VERSION BUMP RULES:
    - Database/Backend/Frontend/Core/Security features: MINOR bump (+0.1.0)
    - UI/Dashboard/Performance/Bugfix features: PATCH bump (+0.0.1)
    - Each feature bumps version independently
    - Features that exist in the template are excluded
EOF
}

# -----------------------------------------------------------------------------
# Argument Parsing
# -----------------------------------------------------------------------------
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project-dir)
                PROJECT_DIR="$2"
                shift 2
                ;;
            --template-dir)
                TEMPLATE_DIR="$2"
                shift 2
                ;;
            --output)
                OUTPUT_FILE="$2"
                shift 2
                ;;
            --base-version)
                BASE_VERSION="$2"
                shift 2
                ;;
            --group-by)
                GROUP_BY="$2"
                if [[ "$GROUP_BY" != "feature" && "$GROUP_BY" != "day" && "$GROUP_BY" != "vertical" ]]; then
                    log_error "Invalid --group-by value: $GROUP_BY (must be 'feature', 'day', or 'vertical')"
                    exit 1
                fi
                shift 2
                ;;
            --no-update-version)
                UPDATE_PACKAGE_JSON=false
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                LOG_LEVEL=$LOG_DEBUG
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use --help for usage information" >&2
                exit 1
                ;;
        esac
    done

    # Validate required arguments
    if [[ -z "$PROJECT_DIR" ]]; then
        log_error "Missing required argument: --project-dir"
        exit 1
    fi

    if [[ ! -d "$PROJECT_DIR" ]]; then
        log_error "Project directory does not exist: $PROJECT_DIR"
        exit 1
    fi

    # Set default template dir
    if [[ -z "$TEMPLATE_DIR" ]]; then
        TEMPLATE_DIR="$DEFAULT_TEMPLATE_DIR"
    fi

    # Validate template directory
    if [[ ! -d "$TEMPLATE_DIR" ]]; then
        log_warn "Template directory not found: $TEMPLATE_DIR (will include all features)"
    fi

    # Set default output file
    if [[ -z "$OUTPUT_FILE" ]]; then
        OUTPUT_FILE="$PROJECT_DIR/docs/CHANGELOG.md"
    fi
}

# -----------------------------------------------------------------------------
# Version Functions
# -----------------------------------------------------------------------------

# Parse version string into components
# Usage: parse_version "1.2.3" -> sets MAJOR, MINOR, PATCH
parse_version() {
    local version="$1"
    # Remove 'v' prefix if present
    version="${version#v}"

    MAJOR="${version%%.*}"
    local rest="${version#*.}"
    MINOR="${rest%%.*}"
    PATCH="${rest#*.}"

    # Handle versions without patch (e.g., "1.0")
    [[ "$PATCH" == "$rest" ]] && PATCH=0

    # Default to 0 if empty
    [[ -z "$MAJOR" ]] && MAJOR=0
    [[ -z "$MINOR" ]] && MINOR=0
    [[ -z "$PATCH" ]] && PATCH=0
}

# Bump version based on type
# Usage: bump_version "1.2.3" "minor" -> outputs "1.3.0"
bump_version() {
    local version="$1"
    local bump_type="$2"

    parse_version "$version"

    case "$bump_type" in
        major)
            MAJOR=$((MAJOR + 1))
            MINOR=0
            PATCH=0
            ;;
        minor)
            MINOR=$((MINOR + 1))
            PATCH=0
            ;;
        patch)
            PATCH=$((PATCH + 1))
            ;;
    esac

    echo "${MAJOR}.${MINOR}.${PATCH}"
}

# Get spernakit_version from package.json
get_spernakit_version() {
    local pkg_json="$PROJECT_DIR/package.json"

    if [[ ! -f "$pkg_json" ]]; then
        log_warn "package.json not found, using default version 1.0.0"
        echo "1.0.0"
        return
    fi

    if command -v jq &> /dev/null; then
        local version
        version=$(jq -r '.spernakit_version // .version // "1.0.0"' "$pkg_json" 2>/dev/null)
        echo "$version"
    else
        # Fallback: grep for spernakit_version or version
        local version
        version=$(grep -o '"spernakit_version"[[:space:]]*:[[:space:]]*"[^"]*"' "$pkg_json" 2>/dev/null | grep -o '"[0-9.]*"' | tr -d '"' || echo "")
        if [[ -z "$version" ]]; then
            version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$pkg_json" 2>/dev/null | head -1 | grep -o '"[0-9.]*"' | tr -d '"' || echo "1.0.0")
        fi
        echo "$version"
    fi
}

# Get app name from package.json
get_app_name() {
    local pkg_json="$PROJECT_DIR/package.json"

    if [[ ! -f "$pkg_json" ]]; then
        basename "$PROJECT_DIR"
        return
    fi

    if command -v jq &> /dev/null; then
        jq -r '.name // "unknown"' "$pkg_json" 2>/dev/null
    else
        grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$pkg_json" 2>/dev/null | grep -o '"[^"]*"$' | tr -d '"' || basename "$PROJECT_DIR"
    fi
}

# -----------------------------------------------------------------------------
# Feature Functions
# -----------------------------------------------------------------------------

# Load template features into cache
load_template_features() {
    local template_features_dir="$TEMPLATE_DIR/.automaker/features"

    if [[ ! -d "$template_features_dir" ]]; then
        log_debug "No template features directory: $template_features_dir"
        return
    fi

    local count=0
    for feature_dir in "$template_features_dir"/*/; do
        [[ ! -d "$feature_dir" ]] && continue
        local feature_name
        feature_name=$(basename "$feature_dir")
        TEMPLATE_FEATURES["$feature_name"]=1
        ((++count))
    done

    log_info "Loaded $count template features for exclusion"
}

# Check if feature exists in template
is_template_feature() {
    local feature_id="$1"

    # Check if feature directory name exists in template
    # Use ${var+x} syntax to handle unset keys with set -u
    if [[ -n "${TEMPLATE_FEATURES[$feature_id]+x}" ]]; then
        return 0
    fi

    return 1
}

# Extract field from feature JSON
# Usage: get_feature_field <json_file> <field_name>
get_feature_field() {
    local json_file="$1"
    local field="$2"

    if command -v jq &> /dev/null; then
        jq -r ".$field // empty" "$json_file" 2>/dev/null
    else
        # Fallback: simple grep extraction (handles simple cases)
        grep -o "\"$field\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$json_file" 2>/dev/null | \
            sed 's/.*:[[:space:]]*"//' | sed 's/"$//' || echo ""
    fi
}

# Get features sorted by completion date
get_completed_features() {
    local features_dir="$PROJECT_DIR/.automaker/features"

    if [[ ! -d "$features_dir" ]]; then
        log_warn "Features directory not found: $features_dir"
        return
    fi

    local -a features=()
    local -a timestamps=()

    for feature_file in "$features_dir"/*/feature.json; do
        [[ ! -f "$feature_file" ]] && continue

        # Check if status is completed
        local status
        status=$(get_feature_field "$feature_file" "status")
        [[ "$status" != "completed" ]] && continue

        # Check for auditSource (skip audit findings)
        local audit_source
        audit_source=$(get_feature_field "$feature_file" "auditSource")
        if [[ -n "$audit_source" ]]; then
            [[ "$VERBOSE" == true ]] && log_debug "Skipping audit feature: $feature_file"
            continue
        fi

        # Get feature ID from directory name
        local feature_dir
        feature_dir=$(dirname "$feature_file")
        local feature_id
        feature_id=$(basename "$feature_dir")

        # Check if template feature
        if is_template_feature "$feature_id"; then
            [[ "$VERBOSE" == true ]] && log_debug "Skipping template feature: $feature_id"
            continue
        fi

        # Get timestamp for sorting (prefer justFinishedAt, then updatedAt, then createdAt)
        local timestamp
        timestamp=$(get_feature_field "$feature_file" "justFinishedAt")
        [[ -z "$timestamp" ]] && timestamp=$(get_feature_field "$feature_file" "updatedAt")
        [[ -z "$timestamp" ]] && timestamp=$(get_feature_field "$feature_file" "createdAt")
        [[ -z "$timestamp" ]] && timestamp="1970-01-01T00:00:00.000Z"

        features+=("$feature_file")
        timestamps+=("$timestamp")
    done

    # Sort by timestamp (simple bubble sort for portability)
    local n=${#features[@]}
    for ((i = 0; i < n; i++)); do
        for ((j = 0; j < n - i - 1; j++)); do
            if [[ "${timestamps[j]}" > "${timestamps[j+1]}" ]]; then
                # Swap
                local temp="${features[j]}"
                features[j]="${features[j+1]}"
                features[j+1]="$temp"

                temp="${timestamps[j]}"
                timestamps[j]="${timestamps[j+1]}"
                timestamps[j+1]="$temp"
            fi
        done
    done

    # Output sorted features
    for feature in "${features[@]}"; do
        echo "$feature"
    done
}

# Get bump type for category
get_bump_type() {
    local category="$1"
    echo "${CATEGORY_BUMP[$category]:-patch}"
}

# Get changelog section for category
get_changelog_section() {
    local category="$1"
    echo "${CATEGORY_SECTION[$category]:-Changed}"
}

# Extract vertical/domain from feature title
# "License Model" → "License"
# "Backup CRUD API" → "Backup"
# "Servers List Page" → "Server" (normalized)
# "Ground Truth Dashboard" → "Ground Truth" (compound)
get_vertical() {
    local title="$1"

    # Handle known compound verticals first
    if [[ "$title" =~ ^(Ground\ Truth|Backup\ Target|Service\ Dependency|Service\ License|Coverage\ Gap|Dependency\ Graph) ]]; then
        echo "${BASH_REMATCH[1]}"
        return
    fi

    # Extract first word
    local first_word="${title%% *}"

    # Normalize plurals to singular
    case "$first_word" in
        Servers) echo "Server" ;;
        Services) echo "Service" ;;
        Backups) echo "Backup" ;;
        Licenses) echo "License" ;;
        Credentials) echo "Credential" ;;
        Ports) echo "Port" ;;
        Verifications) echo "Verification" ;;
        *) echo "$first_word" ;;
    esac
}

# -----------------------------------------------------------------------------
# Changelog Generation
# -----------------------------------------------------------------------------

generate_changelog() {
    local app_name
    app_name=$(get_app_name)

    # Get base version
    if [[ -z "$BASE_VERSION" ]]; then
        BASE_VERSION=$(get_spernakit_version)
    fi

    log_info "App: $app_name"
    log_info "Template base: spernakit v$BASE_VERSION"
    log_info "Template dir: $TEMPLATE_DIR"
    log_info "Group by: $GROUP_BY"
    log_info "Starting from version: 1.0.0"

    # Load template features for exclusion
    load_template_features

    # Get completed features
    local -a features
    mapfile -t features < <(get_completed_features)

    local feature_count=${#features[@]}
    log_info "Found $feature_count completed features (excluding template/audit)"

    if [[ $feature_count -eq 0 ]]; then
        log_warn "No completed features found"
    fi

    # Process features and build changelog entries
    local current_version="1.0.0"
    local -a changelog_entries=()
    local processed=0

    echo ""
    log_info "Processing features..."

    if [[ "$GROUP_BY" == "day" ]]; then
        # Group features by date, one version per day
        local -a day_features=()    # "date|bump_type|section|title|description" per feature
        local -a unique_dates=()

        # First pass: collect all features with their dates
        for feature_file in "${features[@]}"; do
            local title description category timestamp
            title=$(get_feature_field "$feature_file" "title")
            description=$(get_feature_field "$feature_file" "description")
            category=$(get_feature_field "$feature_file" "category")
            timestamp=$(get_feature_field "$feature_file" "justFinishedAt")
            [[ -z "$timestamp" ]] && timestamp=$(get_feature_field "$feature_file" "updatedAt")

            local bump_type section date
            bump_type=$(get_bump_type "$category")
            section=$(get_changelog_section "$category")
            date=$(echo "$timestamp" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' || date +%Y-%m-%d)

            day_features+=("$date|$bump_type|$section|$title|$description")

            # Track unique dates (in order of first appearance)
            local found=false
            for d in "${unique_dates[@]}"; do
                [[ "$d" == "$date" ]] && found=true && break
            done
            [[ "$found" == false ]] && unique_dates+=("$date")
        done

        # Second pass: process each date as a single version
        for date in "${unique_dates[@]}"; do
            local day_bump="patch"
            local -a day_items=()

            # Collect features for this date and determine highest bump
            for entry in "${day_features[@]}"; do
                local e_date e_bump e_section e_title e_desc
                IFS='|' read -r e_date e_bump e_section e_title e_desc <<< "$entry"

                if [[ "$e_date" == "$date" ]]; then
                    day_items+=("$e_section|$e_title|$e_desc")
                    # minor beats patch
                    [[ "$e_bump" == "minor" ]] && day_bump="minor"
                fi
            done

            # Apply single version bump for the day
            current_version=$(bump_version "$current_version" "$day_bump")

            local item_count=${#day_items[@]}
            ((processed += item_count))

            printf "  [%3d/%3d] v%-8s %-6s %s (%d features)\n" "$processed" "$feature_count" "$current_version" "($day_bump)" "$date" "$item_count"

            # Build entry: version|date|item_count|items (items separated by ;;)
            local items_str
            items_str=$(printf "%s;;" "${day_items[@]}")
            changelog_entries+=("$current_version|$date|$item_count|${items_str%;;}")
        done
    elif [[ "$GROUP_BY" == "vertical" ]]; then
        # Group features by vertical/domain
        local -a vert_features=()    # "vertical|date|bump_type|section|title|description" per feature
        local -a unique_verticals=()

        # First pass: collect all features with their verticals
        for feature_file in "${features[@]}"; do
            local title description category timestamp
            title=$(get_feature_field "$feature_file" "title")
            description=$(get_feature_field "$feature_file" "description")
            category=$(get_feature_field "$feature_file" "category")
            timestamp=$(get_feature_field "$feature_file" "justFinishedAt")
            [[ -z "$timestamp" ]] && timestamp=$(get_feature_field "$feature_file" "updatedAt")

            local bump_type section date vertical
            bump_type=$(get_bump_type "$category")
            section=$(get_changelog_section "$category")
            date=$(echo "$timestamp" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' || date +%Y-%m-%d)
            vertical=$(get_vertical "$title")

            vert_features+=("$vertical|$date|$bump_type|$section|$title|$description")

            # Track unique verticals (in order of first appearance)
            local found=false
            for v in "${unique_verticals[@]}"; do
                [[ "$v" == "$vertical" ]] && found=true && break
            done
            [[ "$found" == false ]] && unique_verticals+=("$vertical")
        done

        log_info "Found ${#unique_verticals[@]} verticals: ${unique_verticals[*]}"

        # Second pass: process each vertical as a single version
        for vertical in "${unique_verticals[@]}"; do
            local vert_bump="patch"
            local -a vert_items=()
            local latest_date=""

            # Collect features for this vertical and determine highest bump
            for entry in "${vert_features[@]}"; do
                local e_vert e_date e_bump e_section e_title e_desc
                IFS='|' read -r e_vert e_date e_bump e_section e_title e_desc <<< "$entry"

                if [[ "$e_vert" == "$vertical" ]]; then
                    vert_items+=("$e_section|$e_title|$e_desc")
                    # minor beats patch
                    [[ "$e_bump" == "minor" ]] && vert_bump="minor"
                    # Track latest date for this vertical
                    [[ -z "$latest_date" || "$e_date" > "$latest_date" ]] && latest_date="$e_date"
                fi
            done

            # Apply single version bump for the vertical
            current_version=$(bump_version "$current_version" "$vert_bump")

            local item_count=${#vert_items[@]}
            ((processed += item_count))

            printf "  [%3d/%3d] v%-8s %-6s %s (%d features)\n" "$processed" "$feature_count" "$current_version" "($vert_bump)" "$vertical" "$item_count"

            # Build entry: version|date|vertical|item_count|items (items separated by ;;)
            local items_str
            items_str=$(printf "%s;;" "${vert_items[@]}")
            changelog_entries+=("$current_version|$latest_date|$vertical|$item_count|${items_str%;;}")
        done
    else
        # Per-feature mode (original behavior)
        for feature_file in "${features[@]}"; do
            local title description category timestamp
            title=$(get_feature_field "$feature_file" "title")
            description=$(get_feature_field "$feature_file" "description")
            category=$(get_feature_field "$feature_file" "category")
            timestamp=$(get_feature_field "$feature_file" "justFinishedAt")
            [[ -z "$timestamp" ]] && timestamp=$(get_feature_field "$feature_file" "updatedAt")

            local bump_type section date
            bump_type=$(get_bump_type "$category")
            current_version=$(bump_version "$current_version" "$bump_type")
            section=$(get_changelog_section "$category")
            date=$(echo "$timestamp" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' || date +%Y-%m-%d)

            ((++processed))
            printf "  [%3d/%3d] v%-8s %-6s %s\n" "$processed" "$feature_count" "$current_version" "($bump_type)" "$title"

            # Build entry for per-feature mode
            changelog_entries+=("$current_version|$date|1|$section|$title|$description")
        done
    fi

    echo ""
    log_info "Final version: $current_version"

    # Generate markdown (newest first)
    local changelog=""
    changelog+="# Changelog\n\n"
    changelog+="All notable changes to this project are documented in this file.\n\n"
    changelog+="Based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).\n"
    changelog+="This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n"
    changelog+="**Template Base**: spernakit v$BASE_VERSION\n\n"

    # Reverse order (newest first)
    local i
    for ((i = ${#changelog_entries[@]} - 1; i >= 0; i--)); do
        local entry="${changelog_entries[i]}"

        if [[ "$GROUP_BY" == "day" ]]; then
            # Format: version|date|item_count|items (items as section|title|desc;;section|title|desc)
            local version date item_count items_str
            IFS='|' read -r version date item_count items_str <<< "$entry"

            changelog+="## [$version] - $date\n\n"

            # Parse items and group by section
            local -A sections_added=()
            local -A sections_content=()

            # Split items by ;;
            IFS=';;' read -ra items <<< "$items_str"
            for item in "${items[@]}"; do
                [[ -z "$item" ]] && continue
                local section title desc
                IFS='|' read -r section title desc <<< "$item"

                if [[ -z "${sections_added[$section]+x}" ]]; then
                    sections_added["$section"]=1
                    sections_content["$section"]=""
                fi
                sections_content["$section"]+="- **$title**: $desc\n"
            done

            # Output sections in standard order: Added, Changed, Fixed
            for section_name in "Added" "Changed" "Fixed"; do
                if [[ -n "${sections_content[$section_name]+x}" ]]; then
                    changelog+="### $section_name\n"
                    changelog+="${sections_content[$section_name]}\n"
                fi
            done
        elif [[ "$GROUP_BY" == "vertical" ]]; then
            # Vertical format: version|date|vertical|item_count|items
            local version date vertical item_count items_str
            IFS='|' read -r version date vertical item_count items_str <<< "$entry"

            changelog+="## [$version] - $date - $vertical\n\n"

            # Parse items and group by section
            local -A sections_added=()
            local -A sections_content=()

            # Split items by ;;
            IFS=';;' read -ra items <<< "$items_str"
            for item in "${items[@]}"; do
                [[ -z "$item" ]] && continue
                local section title desc
                IFS='|' read -r section title desc <<< "$item"

                if [[ -z "${sections_added[$section]+x}" ]]; then
                    sections_added["$section"]=1
                    sections_content["$section"]=""
                fi
                sections_content["$section"]+="- **$title**: $desc\n"
            done

            # Output sections in standard order: Added, Changed, Fixed
            for section_name in "Added" "Changed" "Fixed"; do
                if [[ -n "${sections_content[$section_name]+x}" ]]; then
                    changelog+="### $section_name\n"
                    changelog+="${sections_content[$section_name]}\n"
                fi
            done
        else
            # Per-feature format: version|date|1|section|title|desc
            local version date _count section title desc
            IFS='|' read -r version date _count section title desc <<< "$entry"

            changelog+="## [$version] - $date\n\n"
            changelog+="### $section\n"
            changelog+="- **$title**: $desc\n\n"
        fi
    done

    # Add base version entry
    changelog+="---\n\n"
    changelog+="## [1.0.0] - $(date +%Y-%m-%d)\n\n"
    changelog+="Initial release based on spernakit template v$BASE_VERSION.\n\n"
    changelog+="### Inherited from Template\n"
    changelog+="- User authentication and session management\n"
    changelog+="- Role-based access control (SYSOP, ADMIN, USER)\n"
    changelog+="- Dashboard framework with customizable layout\n"
    changelog+="- Settings and preferences management\n"
    changelog+="- SQLite database with Prisma ORM\n"

    # Output or write
    if [[ "$DRY_RUN" == true ]]; then
        echo ""
        echo "=== DRY RUN: Would write to $OUTPUT_FILE ==="
        echo ""
        echo -e "$changelog"
        echo ""
        echo "=== Final version: $current_version ==="
    else
        # Ensure output directory exists
        local output_dir
        output_dir=$(dirname "$OUTPUT_FILE")
        mkdir -p "$output_dir"

        # Write changelog
        echo -e "$changelog" > "$OUTPUT_FILE"
        log_info "Wrote changelog to: $OUTPUT_FILE"

        # Update package.json version
        if [[ "$UPDATE_PACKAGE_JSON" == true ]]; then
            update_package_version "$current_version"
        fi
    fi

    echo "$current_version"
}

# Update version in package.json files
update_package_version() {
    local new_version="$1"

    local -a pkg_files=(
        "$PROJECT_DIR/package.json"
        "$PROJECT_DIR/backend/package.json"
        "$PROJECT_DIR/frontend/package.json"
    )

    for pkg_file in "${pkg_files[@]}"; do
        if [[ -f "$pkg_file" ]]; then
            if command -v jq &> /dev/null; then
                # Use jq for proper JSON editing
                local tmp_file="${pkg_file}.tmp"
                jq --arg v "$new_version" '.version = $v' "$pkg_file" > "$tmp_file" && mv "$tmp_file" "$pkg_file"
                log_info "Updated version in: $pkg_file"
            else
                # Fallback: sed replacement (less reliable)
                sed -i.bak "s/\"version\":[[:space:]]*\"[^\"]*\"/\"version\": \"$new_version\"/" "$pkg_file"
                rm -f "${pkg_file}.bak"
                log_info "Updated version in: $pkg_file (sed fallback)"
            fi
        fi
    done
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    parse_args "$@"

    log_header "Generate Changelog"

    generate_changelog
}

main "$@"

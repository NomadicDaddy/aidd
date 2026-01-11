#!/bin/bash
# =============================================================================
# lib/sync.sh - Feature and Spec File Synchronization for AIDD <-> AutoMaker
# =============================================================================
# Synchronizes features and spec files between AIDD and AutoMaker

# Source dependencies
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"

# -----------------------------------------------------------------------------
# Global Variables for Sync State
# -----------------------------------------------------------------------------
declare -a AIDD_FEATURES=()
declare -a AUTOMAKER_FEATURES=()
declare -a AIDD_DESCRIPTIONS=()      # PERFORMANCE: Pre-extracted descriptions
declare -a AUTOMAKER_DESCRIPTIONS=()  # PERFORMANCE: Pre-extracted descriptions
declare -a AIDD_NORM_DESCRIPTIONS=()      # PERFORMANCE: Pre-normalized descriptions
declare -a AUTOMAKER_NORM_DESCRIPTIONS=()  # PERFORMANCE: Pre-normalized descriptions
declare -a AUTOMAKER_IDS=()          # PERFORMANCE: Pre-extracted feature IDs for fast writes
declare -a MATCHED_PAIRS=()
declare -a UNMATCHED_AIDD=()
declare -a UNMATCHED_AUTOMAKER=()

# Stats counters
SYNC_MATCHED_COUNT=0
SYNC_AIDD_TO_AUTOMAKER_COUNT=0
SYNC_AUTOMAKER_TO_AIDD_COUNT=0
SYNC_UPDATED_AIDD_COUNT=0
SYNC_UPDATED_AUTOMAKER_COUNT=0

# -----------------------------------------------------------------------------
# Main Entry Point
# -----------------------------------------------------------------------------
sync_features() {
    local project_dir="$1"
    local metadata_dir="$2"

    log_header "Synchronizing AIDD <-> AutoMaker"

    # Phase 1: Load features
    load_aidd_features "$metadata_dir"
    load_automaker_features "$project_dir"

    # Phase 2: Match features
    match_features

    # Phase 3-4: Sync
    sync_matched_features
    sync_unique_features

    # Phase 5: Write changes
    write_aidd_features "$metadata_dir"
    write_automaker_features "$project_dir"

    # Phase 6: Sync spec files
    sync_spec_files "$project_dir" "$metadata_dir"

    # Summary
    log_sync_summary
}

# -----------------------------------------------------------------------------
# Phase 1: Load Features
# -----------------------------------------------------------------------------
load_aidd_features() {
    local metadata_dir="$1"
    local features_dir="$metadata_dir/$DEFAULT_FEATURES_DIR"

    log_info "Loading AIDD features from $features_dir"

    if [[ ! -d "$features_dir" ]]; then
        log_warn "AIDD features directory not found, starting with empty list"
        return 0
    fi

    # Find all feature.json files (matching AutoMaker structure)
    while IFS= read -r -d '' feature_file; do
        if [[ -f "$feature_file" ]]; then
            local feature_json
            local description
            local feature_id
            feature_json=$(jq -c '.' "$feature_file" 2>/dev/null)
            if [[ $? -eq 0 && -n "$feature_json" ]]; then
                description=$(echo "$feature_json" | jq -r '.description')
                feature_id=$(echo "$feature_json" | jq -r '.id')

                AIDD_FEATURES+=("$feature_json")
                AIDD_DESCRIPTIONS+=("$description")
                AIDD_FEATURE_IDS+=("$feature_id")
            fi
        fi
    done < <(find "$features_dir" -type f -name "$FEATURE_FILE_NAME" -print0 2>/dev/null)

    log_info "Loaded ${#AIDD_FEATURES[@]} features from AIDD"
}

load_automaker_features() {
    local project_dir="$1"
    local automaker_dir="$project_dir/$DEFAULT_AUTOMAKER_DIR"
    local features_dir="$automaker_dir/$DEFAULT_AUTOMAKER_FEATURES_DIR"

    log_info "Loading AutoMaker features from $features_dir"

    if [[ ! -d "$features_dir" ]]; then
        log_warn "AutoMaker features directory not found, starting with empty list"
        return 0
    fi

    # Find all feature.json files
    while IFS= read -r -d '' feature_file; do
        if [[ -f "$feature_file" ]]; then
            local feature_json
            local description
            local feature_id
            feature_json=$(jq -c '.' "$feature_file" 2>/dev/null)
            if [[ $? -eq 0 && -n "$feature_json" ]]; then
                description=$(echo "$feature_json" | jq -r '.description')
                feature_id=$(echo "$feature_json" | jq -r '.id')

                AUTOMAKER_FEATURES+=("$feature_json")
                AUTOMAKER_DESCRIPTIONS+=("$description")
                AUTOMAKER_IDS+=("$feature_id")

                # PERFORMANCE: Pre-normalize inline (no subshells!)
                local norm="$description"
                norm="${norm,,}"                          # Lowercase
                norm="${norm//[^a-z0-9 ]/}"              # Remove non-alphanumeric
                while [[ "$norm" != "${norm//  / }" ]]; do norm="${norm//  / }"; done  # Collapse spaces
                norm="${norm## }"                         # Trim leading
                norm="${norm%% }"                         # Trim trailing
                AUTOMAKER_NORM_DESCRIPTIONS+=("$norm")
                # Skip pre-normalization for now - too slow with subshells
            else
                log_warn "Skipping invalid JSON file: $feature_file"
            fi
        fi
    done < <(find "$features_dir" -type f -name "feature.json" -print0)

    log_info "Loaded ${#AUTOMAKER_FEATURES[@]} features from AutoMaker"
}

# -----------------------------------------------------------------------------
# Phase 2: Match Features
# -----------------------------------------------------------------------------
match_features() {
    log_info "Matching features by description..."
    local -A matched_automaker_indices  # BUG FIX: Removed duplicate declaration
    log_info "Total AIDD features: ${#AIDD_FEATURES[@]}, Total AutoMaker features: ${#AUTOMAKER_FEATURES[@]}"

    local total_aidd=${#AIDD_FEATURES[@]}

    # For each AIDD feature, try to find a match in AutoMaker
    for i in "${!AIDD_FEATURES[@]}"; do
        # PERFORMANCE: Progress indicator (every 10 features)
        if (( total_aidd > 10 && (i+1) % 10 == 0 )); then
            log_info "Progress: $((i+1))/$total_aidd AIDD features matched"
        fi

        # PERFORMANCE: Use pre-extracted description (no jq call!)
        local aidd_desc="${AIDD_DESCRIPTIONS[$i]}"

        local best_match_idx=-1
        local best_similarity=0

        # Find best match in AutoMaker features
        for j in "${!AUTOMAKER_FEATURES[@]}"; do
            # Skip if already matched
            if [[ -n "${matched_automaker_indices[$j]}" ]]; then
                continue
            fi

            # PERFORMANCE: Use pre-extracted description (no jq call!)
            local automaker_desc="${AUTOMAKER_DESCRIPTIONS[$j]}"

            local similarity
            # PERFORMANCE: Use pre-normalized descriptions!
            local aidd_norm="${AIDD_NORM_DESCRIPTIONS[$i]}"
            local automaker_norm="${AUTOMAKER_NORM_DESCRIPTIONS[$j]}"
            local similarity
            similarity=$(compare_descriptions_normalized "$aidd_norm" "$automaker_norm")

            if [[ $similarity -ge $SYNC_SIMILARITY_THRESHOLD && $similarity -gt $best_similarity ]]; then
                best_similarity=$similarity
                best_match_idx=$j
            fi
        done

        if [[ $best_match_idx -ge 0 ]]; then
            # Found a match
            MATCHED_PAIRS+=("$i:$best_match_idx")
            matched_automaker_indices[$best_match_idx]=1
            ((SYNC_MATCHED_COUNT++))
        else
            # No match found
            UNMATCHED_AIDD+=("$i")
        fi
    done

    # Find unmatched AutoMaker features
    for j in "${!AUTOMAKER_FEATURES[@]}"; do
        if [[ -z "${matched_automaker_indices[$j]}" ]]; then
            UNMATCHED_AUTOMAKER+=("$j")
        fi
    done

    log_info "Matched $SYNC_MATCHED_COUNT feature pairs"
    log_info "Unmatched AIDD features: ${#UNMATCHED_AIDD[@]}"
    log_info "Unmatched AutoMaker features: ${#UNMATCHED_AUTOMAKER[@]}"
}

# -----------------------------------------------------------------------------
# Phase 3: Sync Matched Features
# -----------------------------------------------------------------------------
sync_matched_features() {
    log_info "Synchronizing matched features..."

    for pair in "${MATCHED_PAIRS[@]}"; do
        local aidd_idx="${pair%:*}"
        local automaker_idx="${pair#*:}"

        local aidd_feature="${AIDD_FEATURES[$aidd_idx]}"
        local automaker_feature="${AUTOMAKER_FEATURES[$automaker_idx]}"

        # Compare timestamps
        local aidd_time
        local automaker_time

        aidd_time=$(get_aidd_timestamp "$aidd_feature")
        automaker_time=$(get_automaker_timestamp "$automaker_feature")

        if [[ $automaker_time -gt $aidd_time ]]; then
            # AutoMaker is newer, update AIDD (schemas match - direct copy)
            AIDD_FEATURES[$aidd_idx]="$automaker_feature"
            AIDD_FEATURE_IDS[$aidd_idx]=$(echo "$automaker_feature" | jq -r '.id')
            ((SYNC_UPDATED_AIDD_COUNT++))

            local desc
            desc=$(echo "$automaker_feature" | jq -r '.description')
            log_info "Updated AIDD feature: $desc"

        elif [[ $aidd_time -gt $automaker_time ]]; then
            # AIDD is newer, update AutoMaker (schemas match - direct copy)
            AUTOMAKER_FEATURES[$automaker_idx]="$aidd_feature"
            AUTOMAKER_IDS[$automaker_idx]=$(echo "$aidd_feature" | jq -r '.id')
            ((SYNC_UPDATED_AUTOMAKER_COUNT++))

            local id
            id=$(echo "$aidd_feature" | jq -r '.id')
            log_info "Updated AutoMaker feature: $id"
        fi
        # else: timestamps equal, no sync needed
    done
}

# -----------------------------------------------------------------------------
# Phase 4: Sync Unique Features
# -----------------------------------------------------------------------------
sync_unique_features() {
    log_info "Copying unique features..."

    # Copy AIDD -> AutoMaker
    for idx in "${UNMATCHED_AIDD[@]}"; do
        local aidd_feature="${AIDD_FEATURES[$idx]}"
        local desc
        desc=$(echo "$aidd_feature" | jq -r '.description')

        # Schemas match - direct copy (ID already exists in feature)
        local feature_id
        feature_id=$(echo "$aidd_feature" | jq -r '.id')
        
        AUTOMAKER_FEATURES+=("$aidd_feature")
        AUTOMAKER_IDS+=("$feature_id")
        ((SYNC_AIDD_TO_AUTOMAKER_COUNT++))

        log_info "Created AutoMaker feature: $feature_id from AIDD"
    done

    # Copy AutoMaker -> AIDD
    for idx in "${UNMATCHED_AUTOMAKER[@]}"; do
        local automaker_feature="${AUTOMAKER_FEATURES[$idx]}"
        local desc
        desc=$(echo "$automaker_feature" | jq -r '.description')

        # Schemas match - direct copy (ID already exists in feature)
        local feature_id
        feature_id=$(echo "$automaker_feature" | jq -r '.id')
        
        AIDD_FEATURES+=("$automaker_feature")
        AIDD_FEATURE_IDS+=("$feature_id")
        ((SYNC_AUTOMAKER_TO_AIDD_COUNT++))

        log_info "Created AIDD feature: $feature_id from AutoMaker"
    done
}

# -----------------------------------------------------------------------------
# Phase 5: Write Changes
# -----------------------------------------------------------------------------
write_aidd_features() {
    local metadata_dir="$1"
    local features_dir="$metadata_dir/$DEFAULT_FEATURES_DIR"

    if [[ "$DRY_RUN_MODE" == true ]]; then
        log_info "[DRY RUN] Would write ${#AIDD_FEATURES[@]} features to $features_dir"
        return 0
    fi

    log_info "Writing AIDD features to $features_dir"

    # Ensure directory exists
    mkdir -p "$features_dir"

    # Write each feature to individual file (matching AutoMaker structure)
    for i in "${!AIDD_FEATURES[@]}"; do
        local feature_json="${AIDD_FEATURES[$i]}"
        local feature_id="${AIDD_FEATURE_IDS[$i]}"  # Use pre-extracted ID

        local feature_dir="$features_dir/$feature_id"
        local feature_file="$feature_dir/$FEATURE_FILE_NAME"

        # Create directory if needed
        [[ -d "$feature_dir" ]] || mkdir -p "$feature_dir"

        # Write JSON file (use jq for pretty formatting to match AutoMaker)
        echo "$feature_json" | jq '.' > "$feature_file"
    done

    log_info "Wrote ${#AIDD_FEATURES[@]} features to AIDD"
}

write_automaker_features() {
    local project_dir="$1"
    local automaker_dir="$project_dir/$DEFAULT_AUTOMAKER_DIR"
    local features_dir="$automaker_dir/$DEFAULT_AUTOMAKER_FEATURES_DIR"

    if [[ "$DRY_RUN_MODE" == true ]]; then
        log_info "[DRY RUN] Would write ${#AUTOMAKER_FEATURES[@]} features to $features_dir"
        return 0
    fi

    log_info "Writing AutoMaker features to $features_dir"

    # Ensure directory exists
    mkdir -p "$features_dir"

    # PERFORMANCE: Write each feature using pre-extracted IDs (no jq calls!)
    for i in "${!AUTOMAKER_FEATURES[@]}"; do
        local feature_json="${AUTOMAKER_FEATURES[$i]}"
        local feature_id="${AUTOMAKER_IDS[$i]}"  # Use pre-extracted ID!

        local feature_dir="$features_dir/$feature_id"
        local feature_file="$feature_dir/feature.json"

        # PERFORMANCE: Create directory only if needed
        [[ -d "$feature_dir" ]] || mkdir -p "$feature_dir"

        # PERFORMANCE: Write compact JSON directly (no jq call = ~10s faster)
        printf '%s\n' "$feature_json" > "$feature_file"
    done

    log_info "Wrote ${#AUTOMAKER_FEATURES[@]} features to AutoMaker"
}

# -----------------------------------------------------------------------------
# Phase 6: Sync Spec Files
# -----------------------------------------------------------------------------
sync_spec_files() {
    local project_dir="$1"
    local metadata_dir="$2"

    local aidd_spec="$metadata_dir/$DEFAULT_AIDD_SPEC_FILE"
    local automaker_spec="$project_dir/$DEFAULT_AUTOMAKER_DIR/$DEFAULT_AUTOMAKER_SPEC_FILE"

    log_info "Synchronizing spec files..."

    local aidd_exists=false
    local automaker_exists=false

    [[ -f "$aidd_spec" ]] && aidd_exists=true
    [[ -f "$automaker_spec" ]] && automaker_exists=true

    if $aidd_exists && ! $automaker_exists; then
        if [[ "$DRY_RUN_MODE" == true ]]; then
            log_info "[DRY RUN] Would copy app_spec.txt → app_spec.txt"
        else
            mkdir -p "$(dirname "$automaker_spec")"
            cp "$aidd_spec" "$automaker_spec"
            log_info "Copied app_spec.txt → app_spec.txt"
        fi
    elif ! $aidd_exists && $automaker_exists; then
        if [[ "$DRY_RUN_MODE" == true ]]; then
            log_info "[DRY RUN] Would copy app_spec.txt (AutoMaker → AIDD)"
        else
            cp "$automaker_spec" "$aidd_spec"
            log_info "Copied app_spec.txt (AutoMaker → AIDD)"
        fi
    elif $aidd_exists && $automaker_exists; then
        log_info "Both spec files exist, no sync needed"
    else
        log_warn "No spec files found in either system"
    fi
}

# -----------------------------------------------------------------------------
# Mapping Functions
# -----------------------------------------------------------------------------
map_category_aidd_to_automaker() {
    local aidd_cat="$1"
    case "$aidd_cat" in
        functional) echo "Core" ;;
        security) echo "Security" ;;
        style) echo "UI" ;;
        performance) echo "Performance" ;;
        devex) echo "DevEx" ;;
        *) echo "Core" ;;
    esac
}

map_category_automaker_to_aidd() {
    local automaker_cat="$1"
    case "$automaker_cat" in
        Core|API|Database|Testing) echo "functional" ;;
        Security|Authentication) echo "security" ;;
        UI) echo "style" ;;
        Performance) echo "performance" ;;
        DevEx) echo "devex" ;;
        *) echo "functional" ;;
    esac
}

map_priority_aidd_to_automaker() {
    local aidd_priority="$1"
    case "$aidd_priority" in
        critical) echo "1" ;;
        high) echo "2" ;;
        medium) echo "3" ;;
        low) echo "4" ;;
        *) echo "3" ;;
    esac
}

map_priority_automaker_to_aidd() {
    local automaker_priority="$1"
    case "$automaker_priority" in
        1) echo "critical" ;;
        2) echo "high" ;;
        3) echo "medium" ;;
        *) echo "low" ;;
    esac
}

# -----------------------------------------------------------------------------
# Dependency Resolution
# -----------------------------------------------------------------------------
resolve_dependencies_to_ids() {
    local depends_on_json="$1"

    local result_ids="[]"

    # Parse depends_on array
    local dep_count
    dep_count=$(echo "$depends_on_json" | jq '. | length')

    for (( i=0; i<dep_count; i++ )); do
        local dep_desc
        dep_desc=$(echo "$depends_on_json" | jq -r ".[$i]")

        # PERFORMANCE: Search using pre-extracted arrays (no jq calls!)
        local found_id=""
        for j in "${!AUTOMAKER_FEATURES[@]}"; do
            local automaker_desc="${AUTOMAKER_DESCRIPTIONS[$j]}"

            if [[ "$dep_desc" == "$automaker_desc" ]]; then
                found_id="${AUTOMAKER_IDS[$j]}"
                break
            fi
        done

        if [[ -n "$found_id" ]]; then
            result_ids=$(echo "$result_ids" | jq --arg id "$found_id" '. += [$id]')
        else
            log_warn "Dependency not found in AutoMaker: $dep_desc"
        fi
    done

    echo "$result_ids"
}

resolve_dependencies_to_descriptions() {
    local dependencies_json="$1"

    local result_descs="[]"

    # Parse dependencies array
    local dep_count
    dep_count=$(echo "$dependencies_json" | jq '. | length')

    for (( i=0; i<dep_count; i++ )); do
        local dep_id
        dep_id=$(echo "$dependencies_json" | jq -r ".[$i]")

        # PERFORMANCE: Search using pre-extracted arrays (no jq calls!)
        local found_desc=""
        for j in "${!AUTOMAKER_FEATURES[@]}"; do
            local automaker_id="${AUTOMAKER_IDS[$j]}"

            if [[ "$dep_id" == "$automaker_id" ]]; then
                found_desc="${AUTOMAKER_DESCRIPTIONS[$j]}"
                break
            fi
        done

        if [[ -n "$found_desc" ]]; then
            result_descs=$(echo "$result_descs" | jq --arg desc "$found_desc" '. += [$desc]')
        else
            log_warn "Dependency ID not found in AutoMaker: $dep_id"
            result_descs=$(echo "$result_descs" | jq --arg desc "Unknown feature (id: $dep_id)" '. += [$desc]')
        fi
    done

    echo "$result_descs"
}

# -----------------------------------------------------------------------------
# Utility Functions
# -----------------------------------------------------------------------------
normalize_string() {
    local str="$1"
    # PERFORMANCE: Pure bash - much faster than sed/tr
    str="${str,,}"                    # Lowercase
    str="${str//[^a-z0-9 ]/}"        # Remove non-alphanumeric
    str="${str//  / }"               # Collapse double spaces
    while [[ "$str" != "${str//  / }" ]]; do
        str="${str//  / }"           # Keep collapsing until no double spaces
    done
    str="${str## }"                  # Trim leading spaces
    str="${str%% }"                  # Trim trailing spaces
    echo "$str"
}

generate_feature_id() {
    local description="$1"
    # Convert to kebab-case
    local id
    id=$(echo "$description" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
    # Limit length
    id="${id:0:60}"
    echo "$id"
}

get_aidd_timestamp() {
    local feature="$1"

    local closed_at
    local created_at

    closed_at=$(echo "$feature" | jq -r '.closed_at // empty')
    created_at=$(echo "$feature" | jq -r '.created_at')

    # Use closed_at if available, otherwise created_at
    local timestamp_str
    if [[ -n "$closed_at" && "$closed_at" != "null" ]]; then
        timestamp_str="$closed_at"
    else
        timestamp_str="$created_at"
    fi

    # Normalize date-only timestamps to UTC (add T00:00:00.000Z) for consistent comparison
    if [[ ! "$timestamp_str" =~ T ]]; then
        timestamp_str="${timestamp_str}T00:00:00.000Z"
    fi

    # Convert to seconds since epoch
    date -d "$timestamp_str" +%s 2>/dev/null || echo "0"
}

get_automaker_timestamp() {
    local feature="$1"

    local updated_at
    updated_at=$(echo "$feature" | jq -r '.updatedAt')

    # Convert to seconds since epoch
    date -d "$updated_at" +%s 2>/dev/null || echo "0"
}

# PERFORMANCE: Fast comparison using pre-normalized strings
compare_descriptions_normalized() {
    local norm1="$1"
    local norm2="$2"

    # Exact match
    if [[ "$norm1" == "$norm2" ]]; then
        echo "100"
        return
    fi

    # One contains the other
    if [[ "$norm1" == *"$norm2"* || "$norm2" == *"$norm1"* ]]; then
        echo "90"
        return
    fi

    # First 50 chars match
    if [[ "${norm1:0:50}" == "${norm2:0:50}" ]]; then
        echo "85"
        return
    fi

    echo "0"
}

compare_descriptions() {
    local desc1="$1"
    local desc2="$2"

    # PERFORMANCE: Inline normalization - NO subshells!
    local norm1="$desc1"
    local norm2="$desc2"

    # Lowercase
    norm1="${norm1,,}"
    norm2="${norm2,,}"

    # Remove non-alphanumeric
    norm1="${norm1//[^a-z0-9 ]/}"
    norm2="${norm2//[^a-z0-9 ]/}"

    # Collapse spaces
    while [[ "$norm1" != "${norm1//  / }" ]]; do norm1="${norm1//  / }"; done
    while [[ "$norm2" != "${norm2//  / }" ]]; do norm2="${norm2//  / }"; done

    # Trim
    norm1="${norm1## }"
    norm1="${norm1%% }"
    norm2="${norm2## }"
    norm2="${norm2%% }"

    # Exact match
    if [[ "$norm1" == "$norm2" ]]; then
        echo "100"
        return
    fi

    # One contains the other
    if [[ "$norm1" == *"$norm2"* || "$norm2" == *"$norm1"* ]]; then
        echo "90"
        return
    fi

    # First 50 chars match
    if [[ "${norm1:0:50}" == "${norm2:0:50}" ]]; then
        echo "85"
        return
    fi

    echo "0"
}

log_sync_summary() {
    log_header "Sync Summary"
    log_info "Matched feature pairs: $SYNC_MATCHED_COUNT"
    log_info "Updated AIDD features: $SYNC_UPDATED_AIDD_COUNT"
    log_info "Updated AutoMaker features: $SYNC_UPDATED_AUTOMAKER_COUNT"
    log_info "Created AutoMaker features from AIDD: $SYNC_AIDD_TO_AUTOMAKER_COUNT"
    log_info "Added AIDD features from AutoMaker: $SYNC_AUTOMAKER_TO_AIDD_COUNT"
    log_info "Total features in AIDD: ${#AIDD_FEATURES[@]}"
    log_info "Total features in AutoMaker: ${#AUTOMAKER_FEATURES[@]}"
}

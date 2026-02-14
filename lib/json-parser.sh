#!/bin/bash
set -euo pipefail
# =============================================================================
# lib/json-parser.sh - JSON Parsing Functions for Claude Code Stream-JSON Output
# =============================================================================
# Functions for parsing Claude Code's stream-json events into readable text

# Parse a single JSON line and output formatted text
# Usage: parse_claude_json_line <json_line>
parse_claude_json_line() {
    local json_line="$1"

    # Early return if not valid JSON
    if ! echo "$json_line" | jq -e . >/dev/null 2>&1; then
        echo "$json_line"  # Pass through non-JSON lines
        return
    fi

    local event_type=$(echo "$json_line" | jq -r '.type // empty')

    case "$event_type" in
        system)
            parse_system_event "$json_line"
            ;;
        assistant)
            parse_assistant_event "$json_line"
            ;;
        user)
            parse_user_event "$json_line"
            ;;
        result)
            parse_result_event "$json_line"
            ;;
        *)
            # Unknown event type, skip
            ;;
    esac
}

# Parse system initialization event
parse_system_event() {
    local json="$1"
    local subtype=$(echo "$json" | jq -r '.subtype // empty')

    if [[ "$subtype" == "init" ]]; then
        local model=$(echo "$json" | jq -r '.model // "unknown"')
        local session_id=$(echo "$json" | jq -r '.session_id // "unknown"')

        echo "[INFO] Claude Code session started"
        echo "[INFO] Model: $model"
        echo "[INFO] Session: ${session_id:0:8}..."
    fi
}

# Parse assistant message event
parse_assistant_event() {
    local json="$1"
    local content=$(echo "$json" | jq -c '.message.content[]? // empty')

    while IFS= read -r item; do
        [[ -z "$item" ]] && continue

        local content_type=$(echo "$item" | jq -r '.type // empty')

        case "$content_type" in
            text)
                local text=$(echo "$item" | jq -r '.text // empty')
                if [[ -n "$text" ]]; then
                    echo "[ASSISTANT] $text"
                fi
                ;;
            tool_use)
                local tool_name=$(echo "$item" | jq -r '.name // empty')
                local tool_id=$(echo "$item" | jq -r '.id // empty')
                local tool_input=$(echo "$item" | jq -c '.input // {}')

                echo "[TOOL USE] $tool_name (${tool_id:0:12}...)"
                echo "$tool_input" | jq '.' 2>/dev/null || echo "$tool_input"
                ;;
        esac
    done <<< "$content"

    # Extract token usage
    local input_tokens=$(echo "$json" | jq -r '.message.usage.input_tokens // 0')
    local output_tokens=$(echo "$json" | jq -r '.message.usage.output_tokens // 0')
    local cache_read=$(echo "$json" | jq -r '.message.usage.cache_read_input_tokens // 0')

    if [[ "$input_tokens" != "0" || "$output_tokens" != "0" ]]; then
        echo -n "[TOKENS] Input: $input_tokens, Output: $output_tokens"
        if [[ "$cache_read" != "0" ]]; then
            echo -n ", Cache: $cache_read"
        fi
        echo ""
    fi
}

# Parse user message event (tool results)
parse_user_event() {
    local json="$1"
    local content=$(echo "$json" | jq -c '.message.content[]? // empty')

    while IFS= read -r item; do
        [[ -z "$item" ]] && continue

        local content_type=$(echo "$item" | jq -r '.type // empty')

        if [[ "$content_type" == "tool_result" ]]; then
            local tool_id=$(echo "$item" | jq -r '.tool_use_id // empty')
            local result_content=$(echo "$item" | jq -r '.content // empty')

            # Truncate long results
            local result_preview="${result_content:0:200}"
            if [[ ${#result_content} -gt 200 ]]; then
                result_preview="${result_preview}... (${#result_content} chars)"
            fi

            echo "[TOOL RESULT] ${tool_id:0:12}..."
            echo "[OUTPUT] $result_preview"
        fi
    done <<< "$content"
}

# Parse final result event
parse_result_event() {
    local json="$1"
    local subtype=$(echo "$json" | jq -r '.subtype // empty')
    local is_error=$(echo "$json" | jq -r '.is_error // false')

    if [[ "$is_error" == "true" ]]; then
        local error=$(echo "$json" | jq -r '.error // empty')
        local result_text=$(echo "$json" | jq -r '.result // empty')

        # Check for rate limit (result text contains the reset message)
        if [[ "$result_text" == *"$PATTERN_RATE_LIMIT"* ]] || [[ "$error" == *"rate_limit"* ]]; then
            echo "[RATE_LIMITED] $result_text"
            return
        fi

        echo "[ERROR] ${error:-${result_text:-Unknown error}}"
        return
    fi

    if [[ "$subtype" == "success" ]]; then
        local result=$(echo "$json" | jq -r '.result // empty')
        local duration=$(echo "$json" | jq -r '.duration_ms // 0')
        local cost=$(echo "$json" | jq -r '.total_cost_usd // 0')
        local turns=$(echo "$json" | jq -r '.num_turns // 0')

        echo ""
        echo "[SUCCESS] Session completed"
        echo "[DURATION] ${duration}ms"
        echo "[TURNS] $turns"
        echo "[COST] \$${cost}"
        echo ""
        echo "[RESULT]"
        echo "$result"
    fi
}

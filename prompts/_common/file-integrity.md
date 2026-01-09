## FILE INTEGRITY AND SAFE EDITING

**CRITICAL: File corruption can destroy project progress. Follow these rules strictly.**

### Post-Edit Verification Protocol

**ALWAYS verify after editing files:**

1. **Immediately after `mcp_filesystem_edit_file`:**
    - Use `mcp_filesystem_read_text_file` to read the edited file
    - Verify the final content matches your intent
    - **ESPECIALLY CRITICAL** for JSON files (check valid JSON structure)

2. **If corruption detected:**
    - Run `git checkout -- <file>` IMMEDIATELY
    - Analyze what went wrong
    - Retry with a different approach
    - Document the incident in `/.aidd/progress.md`

3. **Never proceed without verification:**
    - Don't assume edits succeeded
    - Don't batch multiple edits without checking each one
    - Don't continue if corruption is detected

### High-Risk File Categories

**Extra caution required for:**

**JSON files:**

- `/.aidd/feature_list.json` - Feature tracking (mission-critical)
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- Any `.json` configuration files

**Schema files:**

- `schema.prisma` - Database schema
- Migration files - Database changes
- GraphQL schemas - API contracts

**Large files:**

- Files over 500 lines
- Files with complex nested structures
- Files with special formatting requirements

### Safe Editing Strategies

**Strategy 1: Verify-First (Preferred for JSON)**

```
1. Read entire file: mcp_filesystem_read_text_file
2. Plan exact changes
3. Make single targeted edit: mcp_filesystem_edit_file
4. Read entire file again: mcp_filesystem_read_text_file
5. Verify changes are correct
6. If corrupted → git checkout and retry
```

**Strategy 2: Shell Redirection (Alternative for large files)**

```
1. Prepare complete new content
2. Use execute_command with shell redirection
3. Example: echo '...' > file.json
4. Read file to verify: mcp_filesystem_read_text_file
5. If corrupted → git checkout and retry
```

**Strategy 3: Multiple Small Edits (For complex changes)**

```
1. Break large change into small edits
2. Verify after EACH edit (not at the end)
3. If any edit fails → rollback immediately
4. Continue only after verification passes
```

### Common Corruption Patterns

**Pattern 1: JSON Trailing Commas**

```json
// CORRUPTED:
{
  "field": "value",
}  ← Extra comma causes invalid JSON

// CORRECT:
{
  "field": "value"
}
```

**Pattern 2: Incomplete String Replacements**

```
// CORRUPTED:
"description": "This is a long text that
"priority": "high"  ← Missing closing quote

// CORRECT:
"description": "This is a long text that spans multiple lines",
"priority": "high"
```

**Pattern 3: Duplicate Schema Models**

```prisma
// CORRUPTED:
model User { ... }
model User { ... }  ← Duplicate model

// CORRECT:
model User { ... }  ← Single definition
```

**Pattern 4: Unterminated Blocks**

```
// CORRUPTED:
function example() {
  if (condition) {
    // Missing closing brace
}

// CORRECT:
function example() {
  if (condition) {
    // code
  }
}
```

### Recovery Procedures

**Immediate Recovery (Same Session):**

```bash
# Rollback single file
git checkout -- path/to/corrupted/file

# Verify rollback succeeded
git status
cat path/to/corrupted/file
```

**Post-Mortem Analysis:**

1. Document what was being attempted
2. Identify the specific edit that failed
3. Understand why the edit failed
4. Choose alternative approach
5. Retry with more caution

### Verification Checklist

Before considering a file edit successful:

- [ ] File read back after edit
- [ ] Content matches intended changes
- [ ] No corruption artifacts (trailing commas, missing quotes, etc.)
- [ ] JSON files parse correctly (if applicable)
- [ ] Syntax is valid (if code file)
- [ ] Git status shows expected changes
- [ ] No duplicate entries (if schema/config)

### Additional Git Safety

**Always check before committing:**

```bash
# See what files changed
git status

# Review actual changes
git diff

# Verify only expected files modified
git diff --name-only
```

**Red flags to investigate:**

- Unexpected files modified
- Unusually large diffs
- Binary files changed
- Configuration files altered unintentionally

### File Integrity Reminders

**NEVER:**

- Skip post-edit verification
- Batch edits without checking each one
- Proceed with corrupted files
- Ignore git diff warnings

**ALWAYS:**

- Read file after editing
- Use git checkout if corrupted
- Verify JSON files parse correctly
- Document corruption incidents
- Choose safer alternatives after failures

**PREFER:**

- Small, targeted edits over large rewrites
- Reading entire files before editing
- Shell redirection for complete file replacements
- Multiple verification steps over speed

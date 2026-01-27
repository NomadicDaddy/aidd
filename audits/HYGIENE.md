---
title: 'Comprehensive Code Hygiene Audit'
last_updated: '2026-01-26'
version: '1.0'
category: 'Code Quality'
priority: 'Medium'
estimated_time: '2-4 hours'
frequency: 'Quarterly'
---

# Comprehensive Code Hygiene Audit

Execute a comprehensive code hygiene audit by running multiple static analysis tools and consolidating their findings into a single actionable report.

## Phase 1: Execute Analysis Tools

Run the following tools against the codebase and capture their complete output:

### 1. Dead Code Detection

- [ ] **Run undead.md analysis**: Execute the dead code detection process defined in `undead.md`
- [ ] **Run Knip**: `bunx knip` - Detects unused files, dependencies, exports, and types
    - Capture: unused exports, unused dependencies, unused files, unreachable code

### 2. Dependency Analysis

- [ ] **Run Depcheck**: `bunx depcheck` - Identifies unused and missing dependencies
    - Capture: unused dependencies, missing dependencies, devDependencies that should be dependencies
    - Run separately for `frontend` and `backend`

### 3. Code Duplication Detection

- [ ] **Run JSCPD**: `bunx jscpd` - Detects copy-pasted code blocks
    - Capture: duplicate code blocks, duplication percentage, affected files
    - Configure threshold: minimum 5 lines, minimum 50 tokens

### 4. Module Dependency Analysis

- [ ] **Run Madge (Circular Dependencies)**: `bunx madge --circular frontend/src backend/src`
    - Capture: all circular dependency chains

- [ ] **Run Madge (Orphan Modules)**: `bunx madge --orphans frontend/src backend/src`
    - Capture: files that are never imported

- [ ] **Run Madge (Leaf Modules)**: `bunx madge --leaves frontend/src backend/src`
    - Capture: files that don't import anything (potential utility candidates)

## Phase 2: Consolidate and Analyze Results

Review all tool outputs and create a unified remediation plan:

### 1. Consolidate Findings

- [ ] **Cross-reference results**: Identify overlapping issues reported by multiple tools (e.g., Knip and Depcheck both flagging unused dependencies)
- [ ] **Categorize issues**:
    - Dead code (unused exports, unreachable code)
    - Dependency issues (unused, missing, misplaced)
    - Code duplication (copy-paste violations)
    - Architectural issues (circular dependencies, orphaned modules)
- [ ] **Quantify impact**: Count total issues per category and estimate cleanup effort

### 2. Prioritize Remediation

Assign priority levels based on:

- **🔴 Critical**: Circular dependencies, missing dependencies (breaks functionality)
- **🟡 High**: Unused dependencies (bloats bundle), significant code duplication (>10% similarity)
- **🟢 Medium**: Unused exports, orphaned files
- **⚪ Low**: Leaf modules (informational), minor duplication

### 3. Create Remediation Plan

- [ ] **Generate consolidated report**: Create `docs/audits/HYGIENE_AUDIT_RESULTS_YYYY-MM-DD.md` with:
    - Executive summary (total issues, priority breakdown)
    - Detailed findings by category (with file paths and line numbers)
    - Prioritized action items with estimated effort
    - Recommended remediation order
    - Success metrics (target: 0 circular deps, <5% duplication, 0 unused deps)

- [ ] **Create GitHub issues**: For each high-priority finding, create a tracking issue with:
    - Clear description of the problem
    - Affected files
    - Proposed solution
    - Estimated effort
    - Link to audit report

## Expected Deliverables

1. **Raw tool outputs**: All tool results saved in `docs/audits/results/`
2. **Consolidated report**: `spernakit/HYGIENE_AUDIT_RESULTS_YYYY-MM-DD.md` with prioritized findings
3. **Action plan**: Updated task list with specific remediation steps
4. **GitHub issues**: Created for all high-priority findings (optional, requires user approval)

## Notes

- If any tool is not installed, use `bunx` to run it without global installation
- If a tool fails or is not applicable, document why and skip it
- Focus on actionable findings - avoid reporting false positives
- Estimate total remediation effort and propose timeline

---
name: spec
description: 'Create a detailed feature specification with context analysis and a task breakdown. Use to spec a new feature, decide what to build next, or turn a feature idea into an actionable plan.'
metadata:
    aidd-category: recipe-maturity
    aidd-contracts: humanize-docs, prompt-guidelines
---

# Feature Specification

Create detailed feature specifications with comprehensive context analysis and task breakdown.

## Usage

```
spec [feature description or "what's next?"]
```

## Instructions

1. **Determine feature scope**:
    - If user says "what's next?": Find the next uncompleted roadmap item in project documentation
    - If user provides a specific idea: Use their specification from the argument
    - Resolve ambiguity from repository evidence and established project conventions

2. **Gather comprehensive context**:
    - Analyze the codebase for relevant context: similar feature implementations, architecture patterns, existing UI/UX patterns and components, data models and API patterns, authentication and authorization approaches, type definitions and interfaces
    - Review git history for similar features: what approaches worked, what caused problems, evolution patterns and lessons learned

3. **Resolve requirements**:
    - Infer the smallest complete scope from the request, roadmap, code, and project conventions
    - Record material assumptions and any residual product choices that do not block the minimal implementation
    - Choose conservative defaults that preserve current behavior and architecture
    - Never leave placeholders that prevent implementation from starting

4. **Create specification directory**:
    - Create folder: `docs/specs/YYYY-MM-DD-spec-name/`
    - Use current date in YYYY-MM-DD format
    - Use kebab-case for spec name (max 5 words)

5. **Generate technical-spec.md**:
    - Overview: Brief description and purpose
    - Architecture Integration: How it fits existing architecture
    - Implementation Approach: Proven patterns to use based on codebase analysis
    - Technical Requirements: Frontend (UI/UX), Backend (API/data), Database (schema changes), Integration (external services)
    - Acceptance Criteria: Specific, testable requirements

6. **Generate tasks.md**:
    - Parent task with sub-tasks
    - Implementation steps in logical order
    - Quality gates: zero lint errors, all tests passing, build successful, integration verified

7. **Humanize the prose**: write both documents to the humanize-docs skill's style contract (apply the humanize-docs skill to drafted prose before saving): plain natural language, no em-dashes, no AI filler (delve, leverage, robust, seamless). Requirements, acceptance criteria, and technical constraints stay exact and testable.

8. **Validate specification**:
    - Verify consistency with existing architecture
    - Confirm technical feasibility based on codebase analysis
    - Ensure complete task breakdown for implementation
    - Check both documents against the prompt-guidelines skill's pre-send checklist: the goal fits one sentence, exact files/symbols/commands are named (or exploration is explicitly allowed), constraints and forbidden actions are stated, every acceptance criterion is checkable by a named command or observable result, and no unrelated "also" tasks ride along

9. **Report completion**:
    - Provide path to specification directory
    - Summarize key technical decisions
    - Confirm readiness for implementation

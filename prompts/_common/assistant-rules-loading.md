## STEP 0: INGEST ASSISTANT RULES

**CRITICAL: Before proceeding with ANY other steps, check for and ingest assistant rule files.**

This step MUST be executed FIRST, before reading specs, analyzing code, or planning work.

### 1. Check for Assistant Rule Files

Look for and read the following files in order of priority:

- `AGENTS.md` - Agent-specific instructions (preferred)
- `CLAUDE.md` - Agent-specific instructions (fallback when AGENTS.md is absent)
- Tool/assistant-specific rule files (if present) - Project rules for the current environment

These files contain important project rules, guidelines, and conventions that MUST be followed throughout the session.

### 2. Apply Assistant Rules

**CRITICAL PRECEDENCE RULES (canonical instruction-source order, highest to lowest):**

1. `/.aidd/project.md` (see project-overrides.md)
2. Assistant rule files (`AGENTS.md`, `CLAUDE.md`, and any tool/assistant-specific rule files)
3. Generic prompt instructions
4. Default behaviors

- Instructions in assistant rule files **OVERRIDE** generic instructions in this prompt
- If assistant rule files conflict with this prompt, **FOLLOW ASSISTANT RULE FILES**
- Document any rules found in your initial assessment
- Apply these rules consistently throughout the entire session

### 3. Common Rule Categories

Assistant rule files may include:

- **Coding Style:** Formatting conventions, naming patterns, code organization
- **Architectural Patterns:** Preferred designs, anti-patterns to avoid, structure requirements
- **Project Constraints:** Technology choices, security requirements, performance targets
- **Development Workflow:** Git conventions, testing requirements, review processes
- **Quality Standards:** Linting rules, type checking requirements, documentation needs

### 4. Example

If `AGENTS.md` specifies:

- "All database migrations must be applied immediately alongside code changes"
- "No feature flags before public release"
- "Tests may use mocks/fakes"

Then you MUST follow these rules instead of any conflicting generic guidance.

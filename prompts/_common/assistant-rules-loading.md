## STEP 0: INGEST ASSISTANT RULES

**CRITICAL: Before proceeding with ANY other steps, check for and ingest assistant rule files.**

This step MUST be executed FIRST, before reading specs, analyzing code, or planning work.

### 1. Check for Assistant Rule Files

Look for and read the following files in order of priority:

- `.windsurf/rules/` - Project-level rule files (if directory exists)
- `AGENTS.md` - Agent-specific instructions
- Tool/assistant-specific rule files (if present) - Project rules for the current environment

These files contain important project rules, guidelines, and conventions that MUST be followed throughout the session.

### 2. Apply Assistant Rules

**CRITICAL PRECEDENCE RULES:**

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

### 5. Verification

Before proceeding to the next step, confirm:

- [ ] All assistant rule files have been searched for
- [ ] Found rule files have been read and understood
- [ ] Key rules have been noted in your assessment
- [ ] You understand which rules override generic instructions

## PROJECT-SPECIFIC INSTRUCTIONS

**CRITICAL: Check for project-specific overrides that supersede generic instructions.**

### 1. Check for project.txt

Look for `/.automaker/project.txt` in the project directory. This file contains project-specific instructions that **OVERRIDE** generic instructions in this prompt.

**If project.txt exists:**

- Read it immediately before proceeding
- Treat it as the highest-priority instruction source
- Apply all overrides throughout the session
- Document the overrides in your initial assessment

**If project.txt doesn't exist:**

- Proceed with generic instructions
- Note its absence in your assessment

### 2. Common Override Categories

Project.txt may include:

**Testing Procedures:**

- Custom test commands (e.g., `bun run smoke:qc` instead of standard linting)
- Special test requirements or exclusions
- Browser automation specifics
- Performance testing thresholds

**Workflow Modifications:**

- Custom initialization steps
- Modified feature implementation workflow
- Special verification requirements
- Deployment procedures

**Technical Constraints:**

- Required directory structures
- Specific technology versions
- Port assignments
- Environment variable requirements

**Quality Standards:**

- Project-specific linting rules
- Code formatting requirements
- Documentation standards
- Security requirements

### 3. Precedence Rules

**Priority order (highest to lowest):**

1. `/.automaker/project.txt` - Highest priority, overrides everything
2. Assistant rule files (`.windsurf/rules/`, `CLAUDE.md`, etc.)
3. Generic prompt instructions
4. Default behaviors

**Resolution strategy:**

- If project.txt conflicts with this prompt → Follow project.txt
- If project.txt is silent on a topic → Follow assistant rules
- If both are silent → Follow generic prompt instructions

### 4. Example Overrides

**Example project.txt content:**

```txt
## Testing Override
Do NOT run verification tests in Step 5.
This project has a custom CI/CD pipeline that handles testing.
Only run: bun run smoke:qc

## Server Management Override
Dev servers are managed externally by Docker Compose.
Do NOT attempt to start or stop servers.
Frontend: http://localhost:3000 (always running)
Backend: http://localhost:3001 (always running)

## Feature Implementation Override
All features must be implemented behind feature flags.
Use: import { isFeatureEnabled } from '@/lib/features'
```

### 5. Verification

Before proceeding to the next step, confirm:

- [ ] Searched for `/.automaker/project.txt`
- [ ] If found, read and understood all overrides
- [ ] Documented overrides in initial assessment
- [ ] Understand which instructions take precedence
- [ ] Ready to apply overrides throughout session

# AIDD Audit Guide

Quick reference for selecting and running audits with `aidd --audit {AUDIT_NAME}`.

**Multi-Audit Support:** Run multiple audits sequentially with comma-separated names:

```bash
aidd --project-dir ./app --audit SECURITY,CODE_QUALITY,ARCHITECTURE
```

## Lifecycle Phases

Each audit is assigned a lifecycle phase indicating when it should run relative to the development workflow. This is tracked in each audit's frontmatter as `lifecycle:`.

| Phase          | When                     | Purpose                                            |
| -------------- | ------------------------ | -------------------------------------------------- |
| `development`  | During active coding     | Catch issues early while code is being written     |
| `pre-release`  | Before tagging a release | Gate quality before version bump                   |
| `post-release` | After release / periodic | Maintenance, debt, cleanup                         |
| `migration`    | During rebuild/migration | Comparison and compliance checks                   |
| `specialized`  | As needed per stack      | Stack-specific audits (not universally applicable) |
| `reference`    | N/A                      | Not an executable audit                            |

### Development

Run these during active coding to catch issues early.

```bash
aidd --project-dir ./app --audit CODE_QUALITY,LOGIC,COMPLICATION,DEAD_CODE
```

| Audit          | Priority | Time | Focus                                 |
| -------------- | -------- | ---- | ------------------------------------- |
| `CODE_QUALITY` | High     | 1-2h | Linting, formatting, ordering         |
| `LOGIC`        | High     | 2-3h | Control flow, branching, state issues |
| `COMPLICATION` | High     | 2-3h | Complexity creep, function length     |
| `DEAD_CODE`    | High     | 1-2h | Orphaned code before it accumulates   |

### Pre-Release

Run these before tagging a release to gate quality.

```bash
aidd --project-dir ./app --audit SECURITY,ARCHITECTURE,DATABASE,DATA_ARCHITECTURE,TESTING,API_DESIGN,FRONTEND,PERFORMANCE,REACT_BEST_PRACTICES
```

| Audit                  | Priority | Time | Focus                                 |
| ---------------------- | -------- | ---- | ------------------------------------- |
| `SECURITY`             | Critical | 2-4h | Auth, OWASP, encryption               |
| `ARCHITECTURE`         | High     | 2-3h | API design, modularity, design flaws  |
| `DATABASE`             | High     | 2-3h | Schema safety, migrations, rollback   |
| `DATA_ARCHITECTURE`    | Critical | 2-3h | Single source of truth, authority     |
| `TESTING`              | High     | 2-3h | Coverage gaps, test stability         |
| `API_DESIGN`           | High     | 1-2h | Endpoint consistency, docs            |
| `FRONTEND`             | High     | 2-3h | React patterns, accessibility         |
| `PERFORMANCE`          | High     | 1-2h | Core Web Vitals, bundle size, backend |
| `REACT_BEST_PRACTICES` | High     | 3-4h | Vercel React performance patterns     |

### Post-Release

Run these periodically for maintenance, debt tracking, and infrastructure review.

```bash
aidd --project-dir ./app --audit TECHDEBT,HYGIENE,LIGHTHOUSE,DEVOPS,DEPLOYMENT,MONITORING,TECH_STACK,DOCUMENTATION
```

| Audit           | Priority | Time | Focus                             |
| --------------- | -------- | ---- | --------------------------------- |
| `TECHDEBT`      | High     | 2-4h | Accumulated debt inventory        |
| `HYGIENE`       | Medium   | 2-4h | Dead code, deps, imports, secrets |
| `LIGHTHOUSE`    | Medium   | 1-2h | Real-world web vitals             |
| `DEVOPS`        | High     | 2-3h | CI/CD, environments, IaC          |
| `DEPLOYMENT`    | Medium   | 1-2h | Deployment strategies, rollback   |
| `MONITORING`    | High     | 2-3h | Logging, alerting, observability  |
| `TECH_STACK`    | High     | 1-2h | Dependency versions, upgrades     |
| `DOCUMENTATION` | Medium   | 1-2h | Docs quality and coverage         |

### Migration

Run these during rebuilds, rewrites, or major version migrations.

| Audit       | Priority | Time | Focus                                    |
| ----------- | -------- | ---- | ---------------------------------------- |
| `UI_PARITY` | High     | 2-3h | Compare UI surfaces post-rebuild         |
| `REORG`     | Medium   | 1-2h | File structure, naming, directory layout |

> **Prerequisite:** `UI_PARITY` requires a `ui_parity_reference:` directive in the target project's `/.automaker/project.txt` pointing to the reference codebase path.

### Specialized

Stack-specific audits — run only on applicable projects.

| Audit       | Priority | Time | Applies To                     |
| ----------- | -------- | ---- | ------------------------------ |
| `CONVEX`    | Critical | 1-2h | Convex backend projects        |
| `SPERNAKIT` | High     | 3-5h | Spernakit-derived applications |
| `SSOC`      | Medium   | 1-2h | Component-heavy frontends      |
| `AI`        | High     | 4-8h | AI-enabled projects            |

### Reference

| Document                  | Purpose                                               |
| ------------------------- | ----------------------------------------------------- |
| `SEVERITY_CLASSIFICATION` | Severity level definitions (Critical/High/Medium/Low) |

> Note: Reference documents have `type: 'reference'` in frontmatter and are excluded from `--audit-all`.

---

## Audit Categories

### Core Quality (Code Health)

| Audit          | Priority | Time | Best For                                         |
| -------------- | -------- | ---- | ------------------------------------------------ |
| `CODE_QUALITY` | High     | 1-2h | General code quality, linting, formatting        |
| `COMPLICATION` | High     | 2-3h | Code complexity, optimization opportunities      |
| `LOGIC`        | High     | 2-3h | Control flow, state management, logic issues     |
| `TECHDEBT`     | High     | 2-4h | Technical debt identification and prioritization |
| `DEAD_CODE`    | High     | 1-2h | Unused code, orphaned files                      |

### Architecture & Design

| Audit               | Priority | Time | Best For                                             |
| ------------------- | -------- | ---- | ---------------------------------------------------- |
| `ARCHITECTURE`      | High     | 2-3h | Overall architecture, API design, complexity         |
| `DATA_ARCHITECTURE` | Critical | 2-3h | Data flow, single source of truth, database patterns |
| `DATABASE`          | High     | 2-3h | Database design, migrations, schema evolution        |
| `API_DESIGN`        | High     | 1-2h | REST/GraphQL API design, documentation               |
| `AI`                | High     | 4-8h | AI provider integration consistency                  |

### Security

| Audit      | Priority | Time | Best For                                        |
| ---------- | -------- | ---- | ----------------------------------------------- |
| `SECURITY` | Critical | 2-4h | Authentication, authorization, OWASP compliance |

### Performance

| Audit         | Priority | Time | Best For                               |
| ------------- | -------- | ---- | -------------------------------------- |
| `PERFORMANCE` | High     | 1-2h | General performance optimization       |
| `LIGHTHOUSE`  | Medium   | 1-2h | Web vitals, Lighthouse report analysis |

### Infrastructure & DevOps

| Audit        | Priority | Time | Best For                               |
| ------------ | -------- | ---- | -------------------------------------- |
| `DEPLOYMENT` | Medium   | 1-2h | Deployment, monitoring, infrastructure |
| `DEVOPS`     | High     | 2-3h | CI/CD, operational readiness           |
| `MONITORING` | High     | 2-3h | Logging, observability, alerting       |
| `TECH_STACK` | High     | 1-2h | Technology stack validation            |

### Frontend

| Audit      | Priority | Time | Best For                                      |
| ---------- | -------- | ---- | --------------------------------------------- |
| `FRONTEND` | High     | 2-3h | React/UI patterns, performance, accessibility |

### Testing & Documentation

| Audit           | Priority | Time | Best For                           |
| --------------- | -------- | ---- | ---------------------------------- |
| `TESTING`       | High     | 2-3h | Test coverage, testing strategy    |
| `DOCUMENTATION` | Medium   | 1-2h | Documentation quality and coverage |

### Comparison & Migration

| Audit       | Priority | Time | Best For                                                |
| ----------- | -------- | ---- | ------------------------------------------------------- |
| `UI_PARITY` | High     | 2-3h | Compare UI surfaces between two app versions, find gaps |

> **Prerequisite:** `UI_PARITY` requires a `ui_parity_reference:` directive in the target project's `/.automaker/project.txt` pointing to the reference codebase path.

### Stack-Specific

| Audit       | Priority | Time | Best For                             |
| ----------- | -------- | ---- | ------------------------------------ |
| `CONVEX`    | Critical | 1-2h | Convex database patterns, validators |
| `SPERNAKIT` | High     | 2-3h | Spernakit template compliance        |

### Reference

| Document                  | Purpose                                               |
| ------------------------- | ----------------------------------------------------- |
| `SEVERITY_CLASSIFICATION` | Severity level definitions (Critical/High/Medium/Low) |

> Note: Reference documents have `type: 'reference'` in frontmatter and are excluded from `--audit-all`.

---

## Stack Recommendations

### Spernakit Stack

**Essential (Run First):**

```bash
aidd --project-dir ./app --audit SPERNAKIT,SECURITY,CODE_QUALITY
```

**Recommended (Run Monthly):**

```bash
aidd --project-dir ./app --audit ARCHITECTURE,FRONTEND,DATABASE,TESTING
```

**Periodic (Run Quarterly):**

```bash
aidd --project-dir ./app --audit PERFORMANCE,TECHDEBT,DEAD_CODE
```

### React + Convex Stack

**Essential (Run First):**

```bash
aidd --project-dir ./app --audit CONVEX,SECURITY,CODE_QUALITY
```

**Recommended (Run Monthly):**

```bash
aidd --project-dir ./app --audit FRONTEND,DATA_ARCHITECTURE,TESTING
```

**Periodic (Run Quarterly):**

```bash
aidd --project-dir ./app --audit PERFORMANCE,LIGHTHOUSE,TECHDEBT
```

### General TypeScript/Node.js

**Essential (Run First):**

```bash
aidd --project-dir ./app --audit SECURITY,CODE_QUALITY,ARCHITECTURE
```

**Recommended (Run Monthly):**

```bash
aidd --project-dir ./app --audit API_DESIGN,TESTING,DATABASE
```

**Periodic (Run Quarterly):**

```bash
aidd --project-dir ./app --audit DEVOPS,MONITORING,TECHDEBT,DEAD_CODE
```

---

## Quick Start Examples

### New Project Onboarding

```bash
# Run comprehensive audit suite for new projects
aidd --project-dir ./app --audit ARCHITECTURE,SECURITY,CODE_QUALITY
```

### Pre-Release Check

```bash
# Critical audits before release
aidd --project-dir ./app --audit SECURITY,PERFORMANCE,TESTING
```

### Technical Debt Sprint

```bash
# Identify and prioritize tech debt
aidd --project-dir ./app --audit TECHDEBT,DEAD_CODE,COMPLICATION
```

### Performance Investigation

```bash
# Deep dive into performance
aidd --project-dir ./app --audit PERFORMANCE,LIGHTHOUSE,FRONTEND
```

### Post-Rebuild / Migration Parity Check

```bash
# Compare rebuilt app against old version (requires ui_parity_reference in project.txt)
aidd --project-dir ./app --audit UI_PARITY
```

---

## Audit Output

Each audit creates:

- **Feature issues** in `.automaker/features/audit-{name}-{unix_timestamp}-{descriptive-slug}/feature.json`
- **Audit report** in `.automaker/audit-reports/{AUDIT_NAME}-{timestamp}.md`
- **Changelog entry** with audit summary

### Severity to Priority Mapping

| Audit Severity | Feature Priority | Response Time |
| -------------- | ---------------- | ------------- |
| Critical       | 1                | 0-24 hours    |
| High           | 2                | 1-2 weeks     |
| Medium         | 3                | 1-4 weeks     |
| Low            | 4                | 1-3 months    |

---

## Tips

1. **Start with Security** - Always run `SECURITY` first on any new codebase
2. **Use Stack-Specific Audits** - `CONVEX` for Convex apps, `SPERNAKIT` for Spernakit apps
3. **Combine Related Audits** - Use comma-separated audits for efficiency: `--audit SECURITY,CODE_QUALITY`
4. **Limit Iterations** - Use `--max-iterations 1` for single-pass audits
5. **Review Reports** - Check `.automaker/audit-reports/` for detailed findings
6. **Address Critical First** - Focus on Priority 1 issues before moving to lower priorities

# AIDD Audit Guide

Quick reference for selecting and running audits with `aidd --audit {AUDIT_NAME}`.

**Multi-Audit Support:** Run multiple audits sequentially with comma-separated names:

```bash
aidd --project-dir ./app --audit SECURITY,CODE_QUALITY,ARCHITECTURE
```

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

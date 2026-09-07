---
name: onboarding-interview
description: 'Generate a definitive handoff questionnaire for a project being inherited. Use when taking over or onboarding onto an unfamiliar project and wanting the key questions to ask before starting.'
metadata:
    aidd-category: recipe-maturity
---

# Onboarding Interview

Generate a definitive handoff questionnaire for a project you are about to inherit.

## Usage

```
onboarding-interview [app]
```

- `[app]`: app name or absolute path. If omitted, use the current working directory.

## Perspective

Approach the project as the product and technical lead responsible for delivering its v1 release.
Assume this is the only opportunity to question the previous maintainers before taking full
ownership. Produce the definitive set of unanswered questions required for a successful handoff.

## Instructions

### Phase 1 - Reconnaissance

Before writing a single question, read everything the outgoing maintainers have already left behind. Your questionnaire must only ask about things that are **not already answered** by code, commits, or documentation. Repeating what's already written wastes your one shot.

Read (whatever exists):

1. **`.aidd/` artifacts**: `project.md`, `spec.md`, `assertions.md`,
   `project-structure.md`, `roadmap.json`, `roadmap.md`, `project-profile.json`,
   `screen-map.md`, `testing-scenarios.md`, `deployment.md`, `questions.md`, `responses.md`,
   `responses/`, `todo.md`, `notes.md`, `diary/`, `CHANGELOG.md`, `features/`,
   `response-review.md`, `remediation-review.md`, `feature-review-report.md`,
   `audit-reports/`, `reports/`, `runs.jsonl`, `iterations/`, and `active-runs/`
2. **Top-level docs**: `README.md`, `CONTEXT.md`, `CLAUDE.md`, `AGENTS.md`, `docs/`,
   `DEVELOPMENT.md`, any `ARCHITECTURE.md` / `ADR/` / `RFC/` directories
3. **Manifest and config**: `package.json`, `bunfig.toml`, `tsconfig.json`, `drizzle.config.ts`, `vite.config.ts`, any `config/` directory
4. **Code structure**: `backend/src/routes/`, `backend/src/services/`, `backend/src/db/schema/`, `frontend/src/pages/`, `frontend/src/stores/`, `frontend/src/api/` (or the equivalent for non-Spernakit stacks)
5. **Operational surface**: Dockerfiles, CI config, deployment scripts, migration files, seed scripts
6. **Git history**: recent commits, tags, release patterns, contributors

Build a mental model of: what the app does, who uses it, how it's deployed, how it's tested, what state it's in, and, most importantly, **what the documentation leaves unanswered**.

### Phase 2 - Gap Analysis

For each topic area below, explicitly classify what you found:

- **Answered**: code or docs give a confident answer (skip these; don't ask)
- **Partial**: code hints at an answer but the _why_ or _history_ is missing (ask the why)
- **Silent**: no evidence either way (these are the richest questions)

This classification is for your own reasoning; it does not appear in the output file. The output only contains questions targeting **Partial** and **Silent** items.

### Phase 3 - Question Generation

Write the questionnaire. Rules:

- **Organize by category** (see list below).
- **Prioritize every question** with an inline tag:
    - `[CRITICAL]`: cannot responsibly ship v1 without the answer
    - `[HIGH]`: significantly de-risks v1 delivery or prevents rework
    - `[NICE]`: useful context, not blocking
- **Target tacit knowledge**: things that live only in the outgoing maintainer's head: past incidents, rejected approaches, "here be dragons" areas, informal conventions, stakeholder politics, undocumented decisions, hidden assumptions.
- **Prefer open-ended framing**: "What would break if we…", "Why was X chosen over Y?", "Where are you most nervous about v1?", "What have you been putting off?"
- **Never ask what the repo already answers.** If Phase 1 answered it, drop it.
- **Ask about near-misses and incidents**: production scares, data corruption, rollbacks, security events, off-hours pages.
- **Ask about the non-technical**: who the real stakeholders are, who blocks releases, what "done" means to them, what the current maintainers would do differently if starting over.
- **Ask what's deliberately missing**: features cut from scope, abandoned branches, removed dependencies, reverted experiments.
- **Use the shared question grammar**: write every question as one physical-line
  `- **[PRIORITY]** ...?` list item, where `PRIORITY` is exactly `CRITICAL`, `HIGH`, or `NICE`.
  End the prompt with `?`. Use `###` headings for Legend, categories, and Summary; never use `##`
  headings, because CLI interview mode treats each `##` section as one question while the web
  interview surface reads the priority-tagged bullets. No non-question line may end with `?`.

### Categories (cover all that apply)

1. **Product Intent & Vision**: v1 definition of done, target users, success metrics, non-goals, stakeholders, competitors
2. **Business Logic & Domain Rules**: invariants, edge cases, regulatory constraints, "magic numbers," things that look wrong but are intentional
3. **Codebase & Architecture**: load-bearing abstractions, areas of tech debt, code nobody understands, planned refactors, deliberate patterns vs. accidental ones
4. **Data Model & Migrations**: schema decisions, data lineage, migration history pitfalls, data retention, PII handling, backfill scripts
5. **Infrastructure, Deployment & Environments**: hosting, environment differences, secrets management, rollback procedures, DNS, certificates, scheduled jobs
6. **Operations, Monitoring & Incident History**: alerting, dashboards, on-call, past incidents, known failure modes, "3am" scenarios
7. **Security, Auth & Compliance**: threat model, auth boundaries, known vulnerabilities, audit requirements, data classification, pen-test history
8. **Testing & Quality**: what's tested, what isn't, flaky tests, coverage gaps, manual QA rituals, quality gates, release criteria
9. **Dependencies & Third-Party Integrations**: critical vendors, contract/SLA details, deprecations, fragile integrations, license risks, forked libraries
10. **Team Workflows & Conventions**: code review norms, branching, release cadence, documentation expectations, unwritten rules, tribal knowledge
11. **Known Risks, Failure Points & Technical Debt**: top 5 things that scare the outgoing team, debt they wanted to pay but couldn't, decisions they regret
12. **Roadmap & v1 Definition of Done**: remaining work, scope negotiations, deadline pressure, what can/cannot slip, post-v1 plans

### Output

Save the questionnaire to `.aidd/questions.md`. Before replacing an existing file,
inspect `.aidd/responses.md` and `.aidd/responses/`. If a `responses/responseN.md` file exists or
`.aidd/responses.md` contains a recorded answer, preserve `questions.md` and report that the review
is blocked: CLI responses bind to question ordinals, while web responses bind to the exact priority
and prompt. Replacing or reordering answered questions would detach or misbind those answers. An
existing questionnaire may be overwritten when no answers have been recorded.

Use this structure:

```markdown
# Onboarding Interview: {Application}

_Generated: YYYY-MM-DD_
_Context: Final handoff questionnaire. You have one opportunity to ask these because the outgoing maintainers will be unreachable afterward._

### Legend

- **[CRITICAL]** Must answer before assuming ownership
- **[HIGH]** Significantly de-risks v1 delivery
- **[NICE]** Helpful context

---

### 1. Product Intent & Vision

- **[CRITICAL]** What critical product-intent uncertainty remains unanswered?
- **[HIGH]** What high-priority product-intent context remains unknown?
- **[NICE]** What additional product-intent context would be useful?

### 2. Business Logic & Domain Rules

…

### 3. Codebase & Architecture

…

(…continue through all applicable categories…)

---

### Summary

- **Total questions**: N (X critical / Y high / Z nice)
- **Top 5 must-ask** (if you only had 10 minutes with the outgoing team; reference question
  ordinals without repeating their prompts):
    1. Question N
    2. Question N
    3. Question N
    4. Question N
    5. Question N
- **Biggest unknowns identified during Phase 1**: brief list of the areas where documentation is thinnest and risk is highest
```

### Reporting

After writing the file, report:

- Path to the generated questionnaire
- Counts by priority (critical / high / nice)
- The top 3 risks surfaced during Phase 1 that drove the most critical questions

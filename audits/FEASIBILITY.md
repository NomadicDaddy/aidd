---
title: 'Feasibility and Decision Readiness Audit'
last_updated: '2026-06-28'
version: '1.2'
category: 'Planning and Governance'
priority: 'High'
estimated_time: '2-4 hours'
frequency: 'Per proposal or major change'
lifecycle: 'planning'
---

# Feasibility and Decision Readiness Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

This audit evaluates whether a proposed application, product, feature, integration, refactor,
migration, or major change has enough evidence for a responsible go/no-go decision. It applies
to both greenfield and brownfield work.

## Applicability (Conditional Audit): Run Only Against a Proposal

This is a **decision-readiness** audit. It evaluates a **proposal under consideration**, not a
shipped codebase. Before running, confirm there is an actual pending decision:

- **A named proposal / pending decision exists**: a new app, product, feature, integration,
  refactor, migration, or major change that has **not yet been committed to** and needs a
  responsible go/no-go. Run the audit.
- **No proposal, pointed at an existing, shipped app for a routine periodic check**: mark the
  audit **N/A** and **stop**. Do not emit the full report template with placeholder scores. A
  decision-readiness audit with no decision under consideration produces an empty 100/100 report
  with no signal (every report in history that ran this way produced zero findings). Output a
  one-line result instead: _"FEASIBILITY N/A: no pending proposal or decision; the target is an
  implemented system with no go/no-go question. Run an implementation audit (ARCHITECTURE,
  SECURITY, TESTING, …) for post-launch quality."_
- **A decision already captured elsewhere** (a `waiting-approval` backlog feature, a prior
  `.aidd/audit-reports/*` finding, or a roadmap entry) is **existing evidence**, not a new gap.
  Do not re-open it as a feasibility proposal.

> Pre-flight gate: _Has a proposal name and an intended change (greenfield / brownfield / hybrid)
> been supplied?_ If not, return the N/A line above and stop before building the Decision Record.

## Executive Summary

**Critical Priorities**

- **Decision readiness**: The proposal has a named owner, decision owner, approvers,
  recommendation, and explicit go/no-go criteria.
- **Evidence over optimism**: Each feasibility claim is backed by a source artifact, current
  system evidence, stakeholder input, prototype, benchmark, contract, or documented assumption.
- **Risk ownership**: Material risks, assumptions, dependencies, and unresolved questions have
  owners, due dates, and validation paths.
- **Scope discipline**: MVP, non-goals, rollback, operational ownership, and lifecycle cost are
  explicit before implementation begins.

**Essential Standards**

- Do not require every checklist item for every proposal. Apply greenfield-only and
  brownfield-only checks according to proposal type.
- Do not file findings for missing ceremonial documents when equivalent evidence exists in a
  feature spec, README, issue, RFC, interview notes, source code, tests, logs, or commit history.
- File a finding only when the missing or weak evidence materially affects the feasibility
  decision, delivery risk, launch readiness, or long-term ownership.
- Prefer a small set of decision-blocking findings over a large inventory of unanswered
  discovery questions.

## Table of Contents

1. [Applicability (Conditional Audit): Run Only Against a Proposal](#applicability-conditional-audit-run-only-against-a-proposal)
2. [Scope](#scope)
3. [Right-Sizing the Audit](#right-sizing-the-audit)
4. [Feasibility Evidence Model](#feasibility-evidence-model)
5. [Pre-Audit Setup](#pre-audit-setup)
6. [Methodology](#methodology)
7. [Decision Scoring](#decision-scoring)
8. [Severity Guidance](#severity-guidance)
9. [Audit Categories](#audit-categories)
10. [Greenfield-Specific Checks](#greenfield-specific-checks)
11. [Brownfield-Specific Checks](#brownfield-specific-checks)
12. [Consolidated Audit Checklist](#consolidated-audit-checklist)
13. [Finding Rules](#finding-rules)
14. [Report Template](#report-template)
15. [Deliverables](#deliverables)
16. [Success Criteria](#success-criteria)

## Scope

Use this audit for:

- New products, apps, services, platforms, or substantial modules.
- Major features that change user workflows, data models, integrations, security posture, or
  operating model.
- Refactors, migrations, deprecations, rewrites, or architecture changes with delivery or
  business impact.
- Vendor integrations, build-vs-buy decisions, and platform changes.

Do not use this audit for:

- Small implementation tasks where feasibility has already been decided.
- Routine bug fixes with clear reproduction, clear owner, and no broader decision needed.
- Post-launch quality checks. Use the relevant implementation audit instead.

## Right-Sizing the Audit

Match the depth of the audit to the size and reversibility of the decision. A full 15-category
feasibility ceremony is disproportionate for the many small, self-hosted, single-team tools in the
fleet.

**Lightweight Mode**: use when **all** of the following hold:

- The target is a single-team, self-hosted tool with a clear, named owner.
- The change is reversible (no irreversible migration, no external/regulated data, no new
  user-facing trust boundary).
- No committed external deadline, vendor contract, or material spend is at stake.

In Lightweight Mode, run only:

- The **Minimal Decision Questions** (see [Report Template](#report-template)).
- The **Critical Checks** (see [Consolidated Audit Checklist](#consolidated-audit-checklist)).

Skip the full 15-category Decision Scoring unless a Critical or High blocker surfaces, at which
point escalate to the full audit for the affected categories only.

**Full Mode**: use for greenfield systems, major changes, irreversible migrations, regulated or
external data, vendor/build-vs-buy decisions, or any proposal with committed spend or deadlines.
Run the complete methodology, scoring, and category checks.

## Feasibility Evidence Model

Classify each major claim with one of these evidence states:

| State        | Meaning                                                                               | Treatment                                     |
| ------------ | ------------------------------------------------------------------------------------- | --------------------------------------------- |
| Proven       | Verified by code, tests, prototype, benchmark, contract, or committed decision record | Strong evidence                               |
| Supported    | Backed by stakeholder input, analytics, ticket history, prior art, or current docs    | Usually acceptable                            |
| Assumed      | Plausible, documented, and assigned to an owner for validation                        | Acceptable only when risk is low or mitigated |
| Unknown      | Important question has no evidence or owner                                           | Finding if decision-relevant                  |
| Contradicted | Evidence conflicts with the proposal or stated assumptions                            | Finding; often blocker                        |

Evidence may come from:

- Product brief, RFC, feature spec, epic, roadmap, issue, or `.aidd/features/*/feature.json`.
- `.aidd/project.md`, `README.md`, `docs/**`, architecture notes, ADRs, and changelogs.
- Source code, package manifests, config, database schema, routes, tests, scripts, and logs.
- Customer commitments, support tickets, analytics, interview notes, sales feedback, or contracts.
- Vendor documentation, pricing, API limits, security notes, and sandbox results.
- aidd-native decision signals: prior `.aidd/audit-reports/*` (feasibility, security, architecture
  findings), backlog feature status (e.g. `waiting-approval`, claimed, or failed features), the runs
  ledger / `runs.jsonl`, and `roadmap` entries.

## Pre-Audit Setup

### Required Inputs

Identify the proposal being audited and gather the best available artifacts:

- Proposal name and one-sentence summary.
- Greenfield, brownfield, or hybrid classification.
- Requestor, product owner, technical owner, decision owner, and approvers.
- Target users or customers.
- Expected outcome and success metrics.
- Scope boundaries and non-goals.
- Target release, milestone, or decision date.

### Suggested Repository Checks

Adapt these commands to the target project. These are POSIX examples; on Windows, translate them to
PowerShell equivalents (e.g. `Get-ChildItem`, `Get-Content`) consistent with the project's tooling.

```bash
# Project and feature context
ls .aidd
find .aidd/features -maxdepth 2 -name feature.json 2>/dev/null

# Current architecture and delivery surface
find docs -maxdepth 3 -type f 2>/dev/null
find backend frontend src -maxdepth 3 -type f 2>/dev/null

# Package, script, and dependency context
cat package.json 2>/dev/null
find . -maxdepth 3 \( -name package.json -o -name bun.lock \) 2>/dev/null

# Recent decision and implementation history
git log --oneline --decorate -20
git status --short
```

For Spernakit-based applications, also review (where present; some targets are CLI-only or use a
different layout):

- Target app `docs/template/STACK.md`
- Target app `docs/template/DEVELOPMENT.md`
- Target app `.aidd/project.md`
- Target app `.aidd/features/`
- `package.json`, `config/`, `backend/src/db/schema/`, `backend/src/routes/`, `frontend/src/routes.tsx`

## Methodology

### 1. Classify the Proposal

Determine whether the proposal is:

- **Greenfield**: Creates a new app, service, platform, product, or isolated subsystem.
- **Brownfield**: Changes an existing system, workflow, data model, integration, or operating
  model.
- **Hybrid**: Creates new surface area that must integrate with existing systems or migrate
  existing users/data.

Record the classification and apply the relevant specific checks.

### 2. Build a Decision Inventory

Create a compact inventory of:

- Decision owner and approvers.
- Explicit recommendation, if one already exists.
- Scope, non-goals, success metrics, and target milestone.
- Major systems, teams, users, data, vendors, and workflows affected.
- Known assumptions, risks, dependencies, and open questions.

### 3. Verify Evidence

For each major feasibility category:

1. Locate evidence in the proposal, repo, docs, tests, history, stakeholder artifacts, or vendor
   references.
2. Consult aidd-native decision signals before filing or duplicating a finding: prior
   `.aidd/audit-reports/*`, backlog feature status (e.g. `waiting-approval`, claimed, or failed),
   the runs ledger / `runs.jsonl`, and `roadmap` entries. A decision already captured as a
   waiting-approval feature or a prior audit finding is existing evidence, not a new gap.
3. Classify evidence as Proven, Supported, Assumed, Unknown, or Contradicted.
4. Record only decision-relevant gaps.
5. Cross-reference implementation audits when the feasibility question depends on specific
   technical quality:
    - Architecture and API design: [ARCHITECTURE.md](./ARCHITECTURE.md)
    - Security posture: [SECURITY.md](./SECURITY.md)
    - Data model and constraints: [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md),
      [DATABASE.md](./DATABASE.md), [SCHEMA_CONSTRAINTS.md](./SCHEMA_CONSTRAINTS.md)
    - Testing strategy: [TESTING.md](./TESTING.md)
    - Deployment and operations: [DEPLOYMENT.md](./DEPLOYMENT.md), [DEVOPS.md](./DEVOPS.md)
    - UX and accessibility: [WEB_DESIGN_GUIDELINES.md](./WEB_DESIGN_GUIDELINES.md)
    - Maintainability and debt: [TECHDEBT.md](./TECHDEBT.md)

### 4. Score Feasibility Risk

Score each applicable category from 1 to 5:

| Score | Meaning                          |
| ----: | -------------------------------- |
|     1 | Low risk and well understood     |
|     2 | Some uncertainty but manageable  |
|     3 | Moderate risk; mitigation needed |
|     4 | High risk; senior review needed  |
|     5 | Critical risk or likely blocker  |

Suggested interpretation:

| Average Score | Interpretation                                    |
| ------------: | ------------------------------------------------- |
|       1.0-1.9 | Low feasibility risk                              |
|       2.0-2.9 | Feasible with manageable risk                     |
|       3.0-3.4 | Feasible only with mitigations                    |
|       3.5-4.4 | High risk; leadership review recommended          |
|       4.5-5.0 | Not currently feasible or requires major redesign |

### 5. Decide and Recommend

Choose one recommendation:

| Decision                 | Meaning                                           |
| ------------------------ | ------------------------------------------------- |
| Proceed                  | Feasible; risks are acceptable                    |
| Proceed with mitigations | Feasible if named risks are addressed             |
| Prototype / spike first  | Too much uncertainty; validate before committing  |
| Re-scope                 | Valuable, but current scope is too large or risky |
| Defer                    | Not the right time                                |
| Reject                   | Not feasible or not valuable enough               |

## Decision Scoring

Score only categories that carry **real uncertainty** for this specific proposal. Omit categories
that are clearly Low or not applicable rather than filling them with placeholder `1`s; an
all-`1`s table adds ceremony without signal. In Lightweight Mode (see
[Right-Sizing the Audit](#right-sizing-the-audit)), skip this table entirely unless a Critical or
High blocker surfaces. Reserve full-table scoring for genuine greenfield or major-change decisions.

Score these categories when applicable:

| Category                        | Evidence to seek                                          |
| ------------------------------- | --------------------------------------------------------- |
| Strategic fit                   | Roadmap, OKRs, customer commitment, business sponsor      |
| User and market feasibility     | Interviews, support tickets, analytics, sales feedback    |
| Business feasibility            | Value case, KPI, cost of delay, support and GTM impact    |
| Technical feasibility           | Architecture sketch, current code, prototype, spike, docs |
| Data feasibility                | Data model, source systems, quality, ownership, retention |
| Integration feasibility         | Internal/external systems, API contracts, limits, sandbox |
| Security feasibility            | Threat model, auth design, secrets, logging, secure SDLC  |
| Privacy, legal, and compliance  | Data classification, consent, retention, frameworks       |
| Operational feasibility         | Support model, runbooks, monitoring, SLOs, DR             |
| Delivery feasibility            | Scope, estimates, dependencies, staffing, sequencing      |
| UX and design feasibility       | Journeys, prototypes, edge states, accessibility, content |
| Quality and testing feasibility | Test strategy, environments, test data, quality gates     |
| Cost and financial feasibility  | Build cost, run cost, licensing, budget, lifecycle cost   |
| Release and rollout feasibility | Flags, pilot, rollback, migrations, launch monitoring     |
| Maintainability and lifecycle   | Ownership, standards, dependencies, upgrades, deprecation |

## Severity Guidance

Map feasibility findings to aidd severity levels:

- **Critical**: Decision cannot responsibly proceed because ownership, value, technical path,
  legal/compliance constraints, rollback, or risk acceptance is missing or contradicted.
- **High**: Proposal can proceed only after resolving material uncertainty, missing mitigation,
  missing decision owner, unsupported system impact, or unresolved dependency.
- **Medium**: Feasibility evidence is incomplete but bounded; mitigation, spike, or clearer
  documentation is needed before implementation or launch.
- **Low**: Documentation, traceability, or scoring polish that improves governance but does not
  affect the decision.

## Audit Categories

### 1. Proposal Summary and Decision Ownership

Verify:

- The proposal states what is being built or changed.
- Greenfield, brownfield, or hybrid classification is documented.
- Target users or customers are named.
- Problem statement, expected outcome, success metric, and non-goals are explicit.
- Decision owner, product owner, technical owner, sponsor, and approvers are named.

File findings when:

- No accountable decision owner exists.
- The proposal cannot be summarized clearly enough to assess.
- Scope and non-goals are missing in a way that could cause uncontrolled implementation.

### 2. Strategic and Business Fit

Verify:

- The proposal aligns with roadmap, strategy, committed customer work, revenue, risk reduction,
  compliance, or operational goals.
- The cost of doing nothing is understood.
- Competing initiatives and timing trade-offs have been considered.
- Expected value, KPI, cost of delay, pricing, packaging, support, onboarding, and documentation
  impacts are understood.

File findings when:

- No business value or measurable outcome is stated.
- A committed deadline exists but delivery risk or owner is missing.
- Support, sales, onboarding, or documentation impact is material but unowned.

### 3. User, Market, and Adoption Feasibility

Verify:

- User demand is supported by research, customer names, tickets, analytics, or stakeholder input.
- Primary and secondary users are identified.
- Workflow changes, pain severity, frequency, and current workarounds are understood.
- Behavior change, adoption friction, accessibility needs, training, documentation, launch
  communication, and feedback channels are considered.

File findings when:

- The proposal assumes demand with no evidence for a major product commitment.
- A user group is negatively affected without mitigation or owner.
- Adoption, migration, or training is required but not planned.

### 4. Technical Feasibility

Verify:

- Technical approach, impacted systems, dependencies, architecture suitability, technology choices,
  performance, scalability, availability, reversibility, and technical debt are understood.
- Build-vs-buy and vendor options are considered where relevant.
- Required skills, prototypes, benchmarks, or spikes are identified.

File findings when:

- A core technical claim is Unknown or Contradicted.
- Required technology is outside team experience and no spike or staffing plan exists.
- Non-functional requirements are asserted without evidence or test path.

### 5. Data and Integration Feasibility

Verify:

- Required data, data sources, quality, ownership, model changes, migrations, history, analytics,
  lineage, privacy constraints, retention, deletion, and audit logging are understood.
- Internal systems, external vendors, API contracts, rate limits, auth mechanisms, failure modes,
  retries, idempotency, reconciliation, sandbox access, vendor costs, and lock-in risks are known.

File findings when:

- Required data is unavailable, unreliable, or ownerless.
- Migration or backfill risk is material but no plan exists.
- Integration contract, limits, auth, failure handling, or vendor cost is decision-critical and
  unknown.

### 6. Security, Privacy, Legal, and Compliance Feasibility

Verify:

- Assets, authentication, authorization, attack surface, secrets, encryption, monitoring,
  dependency/container/infrastructure scanning, penetration testing, and privileged audit logging
  are considered. These AuthN/AuthZ and sensitive-data review-path checks are universally relevant.
- **Only when the proposal introduces personal/regulated data or external users**: consent, privacy
  notices, retention, deletion, residency, transfer, DPIA/PIA/vendor risk, accessibility
  regulations, records, auditability, and eDiscovery obligations are considered. Do not file
  ceremonial privacy/compliance findings for single-team self-hosted tools that handle no regulated
  data and serve no external users.

File findings when:

- Sensitive data, regulated data, or privileged operations are introduced without a review path.
- AuthN/AuthZ model is missing for user- or data-impacting work.
- Compliance applicability is Unknown for a proposal that may process regulated data.

### 7. Operational and Delivery Feasibility

Verify:

- Post-launch operator, support model, runbooks, monitoring, alerting, dashboards, SLOs, SLAs,
  failure modes, incident response, backups, restore, DR, maintenance windows, support training,
  and customer-facing support materials are understood.
- Scope is estimable, requirements are clear enough to start, dependencies and assumptions are
  documented, risks are owned, timeline is realistic, people are available, specialist skills are
  identified, stakeholder teams are involved, external lead times are understood, sequencing exists,
  and definition of done is clear.

File findings when:

- Nobody owns the system after launch.
- Timeline depends on unowned external lead times, procurement, legal review, or unavailable
  specialist skills.
- Incident, backup, or rollback expectations are material but undefined.

### 8. UX, Design, Quality, and Testing Feasibility

Verify:

- User journeys, wireframes, prototypes, usability, edge cases, loading/empty/success/failure
  states, accessibility, localization, design-system fit, content, labels, help text, and
  notifications are considered where user-facing behavior changes.
- Testing strategy, automated test feasibility, unit/integration/contract/E2E/load/security/
  accessibility coverage, test environments, test data, mocks/stubs/simulators, testable acceptance
  criteria, regression risk, quality gates, and non-functional testability are understood.

File findings when:

- A user-facing proposal lacks the workflow or state model needed to estimate and test it.
- Release-blocking quality gates are missing for high-risk work.
- Test environment or test data assumptions are decision-critical and unknown.

### 9. Cost, Release, and Lifecycle Feasibility

Verify:

- Build cost, run cost, licensing, subscriptions, infrastructure, support, compliance, audit,
  decommissioning, migration, budget approval, and benefit justification are understood.
- Incremental release, phased rollout, feature flags when explicitly approved, beta/pilot/limited
  availability, rollback, reversible migrations, deployment windows, launch metrics, alerts,
  go/no-go criteria, and hypercare are planned.
- Maintenance owner, future-team documentation, standards, dependency support, upgrade path,
  deprecation strategy, observability, debugging, extensibility, and technical debt are addressed.

File findings when:

- The proposal commits to material spend without cost model or funding owner.
- Rollback, migration reversibility, or launch monitoring is missing for risky rollout.
- Long-term maintenance ownership is undefined.

## Greenfield-Specific Checks

Apply when the proposal creates a new system, product, platform, service, or app:

- Why should this be built as a new system?
- Could an existing system, platform, template, or vendor solve it?
- Is the MVP scope clear?
- What architecture pattern and technology stack will be used?
- Who owns the system long-term?
- What operational model supports it?
- How will authentication and authorization work?
- How will dev/test/stage/prod environments be managed?
- How will CI/CD, observability, backups, recovery, and disaster recovery work?
- What is the path from MVP to scale?

## Brownfield-Specific Checks

Apply when the proposal changes an existing system:

- Which components, workflows, APIs, reports, integrations, data models, and customers are
  impacted?
- Are hidden dependencies, legacy behaviors, fragile areas, and defect history understood?
- Is test coverage adequate around impacted areas?
- Does the change preserve backward compatibility?
- Are migrations, schema changes, rollout strategy, rollback, and SLA/SLO risk understood?
- Does the change conflict with ongoing refactors, migrations, releases, or platform work?

## Consolidated Audit Checklist

### Critical Checks

- [ ] Proposal, classification, owner, approvers, and decision owner are explicit.
- [ ] Success metric, scope boundaries, and non-goals are clear enough to constrain work.
- [ ] Recommendation and go/no-go criteria are defined or the audit explains why not.
- [ ] Material risks, assumptions, dependencies, and open questions have owners.
- [ ] Security, privacy, legal, compliance, data, and operational blockers are identified.
- [ ] Rollback or rejection path exists for high-risk implementation or migration work.

### High Priority Checks

- [ ] User demand, business value, and cost of delay are supported.
- [ ] Technical approach and impacted systems are understood.
- [ ] Data sources, migrations, and integration contracts are understood.
- [ ] Delivery scope, timeline, staffing, and external lead times are realistic.
- [ ] Testing, release, monitoring, and support approach are defined.
- [ ] Greenfield or brownfield specific risks are addressed.

### Medium Priority Checks

- [ ] UX states, accessibility, content, and design-system fit are considered.
- [ ] Cost model includes build, run, support, vendor, compliance, and lifecycle costs.
- [ ] Maintainability, ownership, dependency support, upgrade path, and deprecation are considered.
- [ ] Adoption, training, documentation, communications, and feedback mechanism are planned.

### Low Priority Checks

- [ ] Decision record formatting is complete.
- [ ] Category scores and rationale are internally consistent.
- [ ] Evidence links are traceable and easy to review.

## Finding Rules

### Do File Findings

- A missing answer blocks or materially weakens the feasibility decision.
- Evidence contradicts the proposal.
- A high-risk assumption has no owner, validation method, or due date.
- A dependency, legal review, vendor contract, migration, or staffing need affects timing and is
  unowned.
- The proposal needs a prototype, benchmark, or spike before responsible commitment.

### Do Not File Findings

- A checklist item is not applicable to the proposal type.
- Evidence exists in a different artifact than expected.
- The gap is only documentation polish and does not affect the decision.
- Another audit already covers the implementation detail and the feasibility decision only needs
  that audit as a dependency.

### Feature Output Guidance

If this audit produces `.aidd/features/*/feature.json` findings:

- Use `auditSource: "FEASIBILITY"`.
- Use `auditSeverity` according to [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md).
- Include `verificationEvidence` that names the missing, weak, or contradicted decision artifact.
- Include the affected proposal name in the title or description.
- Prefer one finding per decision blocker or mitigation package, not one finding per unanswered
  checklist item.

## Report Template

```markdown
# Feasibility Audit Report - YYYY-MM-DD

## Executive Summary

**Proposal**: [Name]
**Classification**: [Greenfield | Brownfield | Hybrid]
**Recommendation**: [Proceed | Proceed with mitigations | Prototype / spike first | Re-scope | Defer | Reject]
**Average Feasibility Risk Score**: [Score]/5
**Critical Blockers**: [Number]
**High Priority Risks**: [Number]

## Decision Record

| Field                      | Value |
| -------------------------- | ----- |
| Requestor                  |       |
| Product owner              |       |
| Technical owner            |       |
| Business sponsor           |       |
| Decision owner             |       |
| Approvers                  |       |
| Date assessed              |       |
| Target release / milestone |       |

## Summary Scores

| Category                                   | Score | Evidence State | Notes |
| ------------------------------------------ | ----: | -------------- | ----- |
| Strategic fit                              |       |                |       |
| User and market feasibility                |       |                |       |
| Business feasibility                       |       |                |       |
| Technical feasibility                      |       |                |       |
| Data feasibility                           |       |                |       |
| Integration feasibility                    |       |                |       |
| Security feasibility                       |       |                |       |
| Privacy, legal, and compliance feasibility |       |                |       |
| Operational feasibility                    |       |                |       |
| Delivery feasibility                       |       |                |       |
| UX and design feasibility                  |       |                |       |
| Quality and testing feasibility            |       |                |       |
| Cost and financial feasibility             |       |                |       |
| Release and rollout feasibility            |       |                |       |
| Maintainability and lifecycle              |       |                |       |

## Key Assumptions

| ID  | Assumption | Owner | Validation Method | Due Date | Status |
| --- | ---------- | ----- | ----------------- | -------- | ------ |
| A1  |            |       |                   |          |        |

## Key Risks

| ID  | Risk | Probability | Impact | Owner | Mitigation | Status |
| --- | ---- | ----------: | -----: | ----- | ---------- | ------ |
| R1  |      |             |        |       |            |        |

## Dependencies

| ID  | Dependency | Internal / External | Owner | Required By | Status |
| --- | ---------- | ------------------- | ----- | ----------- | ------ |
| D1  |            |                     |       |             |        |

## Open Questions

| ID  | Question | Owner | Needed By | Decision Impact | Status |
| --- | -------- | ----- | --------- | --------------- | ------ |
| Q1  |          |       |           |                 |        |

## Detailed Findings

### Critical

- [Decision blocker, evidence, impact, required mitigation]

### High Priority

- [Material risk, evidence, impact, required mitigation]

### Medium and Low Priority

- [Bounded gaps and governance improvements]

## Final Recommendation

| Field                   | Value |
| ----------------------- | ----- |
| Recommendation          |       |
| Rationale               |       |
| Required mitigations    |       |
| Conditions for approval |       |
| Decision owner          |       |
| Decision date           |       |
| Review date             |       |

## Minimal Decision Questions

1. Why are we doing this?
2. Who benefits, and how do we know?
3. What does success look like?
4. What systems, teams, data, and users are impacted?
5. Is it technically achievable with current constraints?
6. What are the biggest risks and unknowns?
7. What will it cost to build and run?
8. What security, privacy, legal, or compliance issues exist?
9. How will we test, release, monitor, and roll back?
10. Who owns it after launch?

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date or milestone]
```

## Deliverables

- Feasibility audit report with recommendation and category scores.
- Decision record with owner, approvers, risks, assumptions, dependencies, and open questions.
- Prioritized findings for unresolved decision blockers or mitigation gaps.
- Prototype, spike, re-scope, defer, or rejection recommendation when commitment is premature.

## Success Criteria

- A decision owner can make or defer the decision using the audit report alone.
- All Critical and High feasibility risks have owners, mitigations, and due dates.
- The recommendation is traceable to evidence rather than unverified assumptions.
- Greenfield and brownfield applicability is explicit.
- The implementation team knows what must be validated before build, launch, or scale.

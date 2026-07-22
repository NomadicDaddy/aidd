---
title: 'Audit Methodology - Falsification-First Verification'
last_updated: '2026-07-20'
version: '1.2'
category: 'Reference'
priority: 'Critical'
estimated_time: 'Reference'
frequency: 'Always'
type: 'reference'
lifecycle: 'reference'
description: 'Mandatory methodology every aidd audit must follow: validate the instrument, read the enforcing implementation, falsify every by-design rationale, never score from a green gate'
---

# Audit Methodology - Falsification-First Verification

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

This document defines how **every** aidd audit must be conducted. It is referenced by the `> **Methodology gate**:` line near the top of each audit framework. An audit report that does not satisfy the rules below is invalid and must be re-run, regardless of the score it produced.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Applicability & Scope](#applicability--scope)
3. [Pre-Audit Setup](#pre-audit-setup)
4. [Phase 0. Validate the Instrument Before You Read It](#phase-0-validate-the-instrument-before-you-read-it)
5. [1. Read the Enforcing Implementation - Cite `file:line`](#1-read-the-enforcing-implementation--cite-fileline)
6. [2. Every "Not a Finding (By Design: X)" Requires a Falsification Record](#2-every-not-a-finding-by-design-x-requires-a-falsification-record)
7. [3. Never Score From a Green Gate Alone](#3-never-score-from-a-green-gate-alone)
8. [4. Degenerate-Control Rule](#4-degenerate-control-rule)
9. [Scoring validity](#scoring-validity)
10. [Relationship to Audit Output](#relationship-to-audit-output)
11. [Audit Checklist](#audit-checklist)
12. [Report Template](#report-template)
13. [Deliverables](#deliverables)

## Executive Summary

This methodology exists because a real audit failed. On commit `bb387ae4`, the SECURITY audit scored **88/100 with 0 issues** while that commit shipped a **CRITICAL reverse-proxy authentication bypass**. The audit reached a clean score by reading the wrong evidence:

- It read the **config default** (`web.authToken` unset) and concluded the control plane was loopback-only and therefore safe.
- It read the code's **own prose** - the `server.ts` comment "Loopback-only listener … CORS, rate-limit, and CSRF plugins are intentionally omitted" - and treated that comment as proof the listener could not be reached from off-box.
- It **reasoned past** the assumption it should have been testing: that "loopback-only, by design" holds even when a reverse proxy (Caddy) sits in front of the listener and forwards off-box requests over a loopback socket.

The enforcing implementation that actually decides this - `backend/src/plugins/bearerTokenGuard.ts` `isPeerAuthorized` - was never opened, and the falsifying request (a Caddy-forwarded call carrying `X-Forwarded-For` and no token) was never constructed. Rules 1-4 below make that failure mode impossible to repeat.

**Phase 0 exists because a second audit failed a different way.** On 2026-07-18 the PERFORMANCE audit ran against two targets and passed both. Two days later, a run of fixes landed for defects it had been looking straight at: a chunk-graph regression that put the React runtime behind two serialized round trips, a size gate that had never once executed because no smoke mode invoked it, a `--mode preview` flag that silently measured the dev server, Web Vitals aggregated at the mean instead of p75, source maps served publicly from `/assets/`, and a target serving every asset uncompressed and uncacheable. The audit did not reason past bad evidence the way `bb387ae4` did - it consumed evidence produced by broken and absent instruments and never questioned the instruments. On one target it reported only two findings, both later closed as artifacts of the broken measurement; on the other it reported `84/100` and `0/0/0/0` in a report whose own text says no measurement artifact was present. Rules 1-4 govern how you read evidence. Phase 0 governs whether the evidence is worth reading.

## Applicability & Scope

These rules bind **every** aidd audit framework in this directory (SECURITY, PROXY_AUTH_BOUNDARY, OUTBOUND_SSRF, and all others). They apply to every control the audit asserts is present, every rationale the audit records under "not a finding / by design", and every "N/A" classification the audit makes. They apply equally to local-only / single-user tools and full multi-user deployments - the failure on `bb387ae4` was on a local-tool target.

## Pre-Audit Setup

Before executing any audit, read this reference and the target audit definition. Prepare to record:

- The instrument record for every instrument the audit names (Phase 0).
- The enforcing implementation `file:line` for each control marked present.
- The falsification scenario for each "by design", "N/A", or "not a finding" disposition.
- The outcome of each falsification trace: **passed** or **blocked**.
- Any green gate used only as supporting context, never as sole proof.

## Phase 0. Validate the Instrument Before You Read It

Run this before any other rule. An audit that names an instrument - a script, a build artifact, a probe, a log - may not read, cite, or score that instrument's output until the instrument itself clears three assertions:

1. **Present.** The instrument exists in **this** target. Audit frameworks are written against the spernakit template; a derived application, or a project with a different topology, may not have the script at all. "The audit names it" is not evidence it is installed here.
2. **Wired.** It is invoked by a gate, smoke mode, or CI job - not merely present as a `package.json` script. An instrument nothing calls has never run, and its absence from the failure record means nothing.
3. **Faithful.** It measures the artifact the audit claims. Name the build (dev / preview / production), the server that actually served the bytes, and the statistic (mean / p75 / max). A flag that selects a mode is not proof the mode took effect - read the code that consumes the flag.

Record one instrument record per instrument, whatever the outcome:

| Field      | Meaning                                                                       |
| ---------- | ----------------------------------------------------------------------------- |
| `name`     | The instrument invoked (`check:critical-path`, `logs/crawltest.json`, …)      |
| `kind`     | `script` \| `artifact` \| `probe`                                             |
| `target`   | What it measured (`frontend/dist`, the running app's `/assets/` responses, …) |
| `evidence` | Artifact path + mtime/hash, or the captured request/response                  |
| `measured` | What the number represents: which build, which server, which percentile       |
| `verified` | `true` only when all three assertions above hold                              |

### An absent or broken instrument is a finding, not reduced scope

This is the rule the 2026-07-18 reports broke. When an instrument fails Phase 0, the audit does **not** quietly narrow to what it can still see. It raises a **High** finding - the target has no working measurement for a dimension the framework requires - and continues with the remaining instruments. `verify-minification` sat in `package.json` invoked by no smoke mode; `crawltest --mode preview` parsed its flag on `=` while the caller passed the space form and so had never measured a production build. Both were named in the framework's methodology. Both would have failed assertion 2 and 3 respectively on any run, in either direction, for months. Neither was ever reported, because no rule asked.

### No validated instrument means no score

A measurement audit that clears zero instruments produces a report marked `SKIPPED / data-unavailable` carrying the Phase 0 records and the High finding - and **no** numeric score, no issue counts, and no remediation recommendations. This is enforced mechanically at report-write time for `PERFORMANCE`, `LIGHTHOUSE`, and `BUILD_OUTPUT`: a score declared without at least one structurally valid instrument record with `verified: true` is stripped and replaced with `SKIPPED / data-unavailable`, and the run summary carries a warning. The report writer validates the record's required fields and recognized `kind`; it cannot independently rerun the instrument or authenticate the evidence path. Phase 0's present, wired, and faithful assertions remain the auditor's responsibility, and setting `verified: true` without performing them invalidates the audit. Do not treat the enforcement as the rule - emit and verify the records.

**Worked example (the 2026-07-18 failure).** The report stated: _"No logs/crawltest.json or frontend/dist/stats.html present; scored code-level only, no lab metrics fabricated."_ It then printed `84/100` with `0/0/0/0`. The first clause is a correct Phase 0 observation; the second sentence is the defect. Under this rule the same run produces:

> **Instrument records**
>
> | name                  | kind     | target          | verified | why                                                       |
> | --------------------- | -------- | --------------- | -------- | --------------------------------------------------------- |
> | `verify-compression`  | script   | served assets   | **no**   | not present in this target's `package.json` (assertion 1) |
> | `build:analyze`       | script   | `frontend/dist` | **no**   | not present in this target's `package.json` (assertion 1) |
> | `logs/crawltest.json` | artifact | routes          | **no**   | artifact absent; crawl not run (assertion 1)              |
>
> **Status:** `SKIPPED / data-unavailable`. **Finding (High):** no working frontend measurement instrument exists in this target; the PERFORMANCE framework's Phase 1 and Phase 4 cannot be executed here.

That target's PERFORMANCE audit ran seven times between 2026-05-26 and 2026-07-18 with none of those instruments ever present. Under this rule the first of those seven runs files the finding, instead of the seventh producing a score.

## 1. Read the Enforcing Implementation - Cite `file:line`

A config default, a documentation comment, an assertion in the code's own prose, or a claim in an `assertions.md` / spec file is **never** sufficient evidence that a control works. For every control you mark as present and working, open the guard, gate, validator, or predicate that **enforces** it at runtime and cite the exact `file:line` where the enforcement happens.

**What "the enforcing implementation" means:** the line that returns/throws/closes on the failure path - not the line that describes the intent.

**Worked example (the `bb387ae4` failure):** The audit cited `backend/src/server.ts:68` (the "Loopback-only listener" comment) as evidence the API was unreachable off-box. That comment describes intent, not enforcement. The enforcing implementation is `backend/src/plugins/bearerTokenGuard.ts:96-108` (`isPeerAuthorized`) plus its mount at `backend/src/server.ts:79`. Reading `isPeerAuthorized` shows the loopback shortcut at line 105-106 is gated behind `if (requestIsForwarded) { … }` at line 102 - a fact the comment does not state. You cannot assess the control without reading the function that implements it.

- A control whose only cited evidence is a comment, a config default, or a spec claim is an **un-verified control** and must be re-examined against its enforcing code before the audit may score it.

## 2. Every "Not a Finding (By Design: X)" Requires a Falsification Record

For every rationale of the form "this is not a finding because, by design, X holds," the auditor MUST:

1. Write the concrete scenario that would **violate** X (the request, config, or call that, if it slipped through, would break the assumption).
2. Test that scenario against the **enforcing implementation** (Rule 1), tracing the exact code path it takes.
3. Record the outcome - **passed** (control held, attack blocked) or **blocked** (control failed, attack succeeded) - with the deciding `file:line`.

An un-falsified "by design" rationale is **itself a finding**: an incomplete audit. The absence of a falsification record is not neutral; it is a defect in the report.

**Worked example.** This is not a hypothetical: a real audit of this codebase accepted "by design: loopback-only" without the record below and was wrong to — the rationale is only sound because a specific branch exists, and the audit never looked at it. A "by design: loopback-only" rationale requires this falsification record:

> **Scenario:** A reverse proxy (Caddy) terminates the public connection and forwards to `127.0.0.1:<port>`, so the transport peer is loopback. The attacker's request carries `X-Forwarded-For: <attacker-ip>` and **no** `Authorization` header. Does the loopback exemption let it through?
>
> **Trace:** `bearerTokenGuard.ts` → `isForwardedRequest` (line 72-79) returns `true` because `x-forwarded-for` is present → `isPeerAuthorized` (line 96) enters the `requestIsForwarded` branch at line 102 → with no `authToken` configured, returns `false` (line 103) → guard sets 401 (line 131-132).
>
> **Outcome:** **passed** - forwarded request fails closed at `bearerTokenGuard.ts:103`. _(Had the guard reached line 105's loopback shortcut, the outcome would be **blocked** and a CRITICAL finding.)_

Only after writing and tracing that record may the auditor conclude "loopback-only" holds. The conclusion depends entirely on the forwarded-request branch existing: against a guard that lacked it, the identical "loopback-only" rationale would have been a CRITICAL vulnerability signed off as safe. Reason from the trace, never from the rationale.

## 3. Never Score From a Green Gate Alone

A passing `smoke`, `smoke:qc`, `check:config`, test run, or any other gate is **not** evidence that a security or correctness control works - especially on paths a UI-driven or build-time gate cannot reach. Gates exercise the happy path the developer wired up; they do not construct the adversarial request.

- A clean score backed by zero falsification records (Rule 2) is **invalid** and must be re-run.
- "The build is green / smoke passed / the app starts" may appear as supporting context but may never stand in for a falsification trace against the enforcing implementation.

**Worked example (the `bb387ae4` failure):** The smoke gate drives the local browser UI over loopback with no forwarding headers - exactly the path the loopback exemption allows. It can never issue an `X-Forwarded-For` request from an off-box peer, so it cannot exercise the bypass. A green smoke run told the auditor nothing about the proxied path, yet the 88/100 score implicitly leaned on "it works in practice."

## 4. Degenerate-Control Rule

When a SaaS-shaped control is marked **N/A** for an aidd target (RBAC, JWT sessions, OAuth, multi-tenant isolation, CSRF), do **not** stop at "N/A." aidd is a local-first single-user tool that replaces these controls with **reduced equivalents**. Find the reduced equivalent and audit **that** instead.

| SaaS control marked N/A        | aidd reduced equivalent to audit instead                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| 5-tier RBAC / role guards      | The web bearer token (`web.authToken`) enforced by `bearerTokenGuard.ts`                    |
| Multi-tenant isolation         | The workspace-path containment policy (`paths.ts` `pathIsInside`, allowed-root checks)      |
| JWT sessions / token blacklist | The single static bearer token + loopback-vs-forwarded trust decision in `isPeerAuthorized` |
| OAuth / external IdP           | The provider `apiKey` handling and the outbound provider-trust boundary (see OUTBOUND_SSRF) |

Marking RBAC "N/A by design (single-user)" without auditing the bearer-token-in-place-of-RBAC is the same class of error as the `bb387ae4` failure: it dismisses a control surface by classification instead of examining the control that actually stands in for it.

## Scoring validity

A report is **invalid** - its score must be discarded and the audit re-run - if **any** of the following is true:

- It reads, cites, or scores an instrument's output without an instrument record for that instrument (Phase 0).
- It narrows its scope around a missing or broken instrument instead of raising a High finding (Phase 0).
- It carries a numeric score with zero instrument records marked `verified: true` (Phase 0).
- It records a "by design" / "N/A" / "not a finding" disposition without a corresponding falsification record (Rule 2).
- It cites a comment, config default, or spec claim as the sole evidence for a control instead of the enforcing `file:line` (Rule 1).
- Its score is backed by a green gate (smoke/qc/test/build) with zero falsification records (Rule 3).
- It marks a SaaS control N/A without auditing aidd's reduced equivalent (Rule 4).

A valid report carries one falsification record per "by design" / "N/A" / "not a finding" call, each ending in **passed** or **blocked** with a deciding `file:line`. The count of falsification records must equal the count of such dispositions; a mismatch is itself reportable as an incomplete audit.

## Relationship to Audit Output

Findings produced under this methodology - including "incomplete audit" findings raised when a prior report lacked falsification records - become `feature.json` files in `.aidd/features/` exactly as defined in [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md). The `description` field MUST carry the falsification record's deciding `file:line` and the concrete scenario traced, so the evidence is reproducible by the next auditor.

## Audit Checklist

- [ ] Every instrument the audit names has an instrument record with a `verified` outcome.
- [ ] Every instrument that failed Phase 0 produced a High finding, not a narrowed scope.
- [ ] No number is cited from an instrument that did not clear Phase 0.
- [ ] Every asserted control cites its enforcing implementation `file:line`.
- [ ] Every "by design", "N/A", and "not a finding" disposition has a falsification record.
- [ ] Every falsification record includes scenario, trace, deciding `file:line`, and outcome.
- [ ] No score relies on a green gate as sole evidence.
- [ ] Any reduced/local equivalent control is audited when a SaaS-shaped control is marked N/A.

## Report Template

```markdown
## Instrument Validation (Phase 0)

| name   | kind                    | target             | evidence               | measured                      | verified |
| ------ | ----------------------- | ------------------ | ---------------------- | ----------------------------- | -------- |
| [name] | [script/artifact/probe] | [what it measured] | [path + mtime, or req] | [build / server / percentile] | [yes/no] |

- Instruments verified: [count] of [count]
- Findings raised for failed instruments: [ids, or none required]
- Score permitted: [yes / no - SKIPPED / data-unavailable]

## Methodology Validity

- Enforcing implementation citations complete: [yes/no]
- Falsification records required: [count]
- Falsification records present: [count]
- Green-gate-only controls found: [none/list]
- Reduced-equivalent controls audited for N/A dispositions: [yes/no/N/A]

### Falsification Records

| Disposition                 | Scenario                     | Enforcing file:line | Outcome          |
| --------------------------- | ---------------------------- | ------------------- | ---------------- |
| [N/A/by design/not finding] | [What would break the claim] | [path:line]         | [passed/blocked] |
```

## Deliverables

Every audit report that references this methodology must include:

- Instrument-validation table covering every instrument the audit names, with a `verified` outcome for each.
- A High finding per instrument that failed Phase 0, filed as a `feature.json` like any other.
- Methodology-validity summary.
- Falsification records for every "by design", "N/A", and "not a finding" disposition.
- Enforcing implementation citations for every control marked present.
- Feature JSON remediation files for incomplete-audit findings when required evidence is missing.

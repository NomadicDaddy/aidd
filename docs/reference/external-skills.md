# External skills

aidd ships only its own skill implementations. Some workflows can use an agent-native upstream
skill, or an explicitly scoped aidd-owned replacement. A shared name is not evidence of identical
instructions, and a replacement does not establish that the upstream workflow ran.

The agent verifies the exact source and invocation permissions at runtime. Record whether a source
is absent, unreadable, invocation-restricted, or outside the requested scope, with the observed
evidence. `disable-model-invocation: true` means the skill cannot be automatically invoked; it does
not mean uninstalled. Respect that restriction rather than reading and executing the same workflow
another way. See [Claude's invocation rules](https://code.claude.com/docs/en/skills#control-who-invokes-a-skill).

aidd does not detect, install, update, or remove agent-native skills. An optional upstream skill
does not block work when a documented replacement covers the requested scope. Missing required
contracts or unresolved required work do block completion. The local-folder skill import described
in [the panel's Skills doc](../../frontend/content/docs/skills.md) is a separate,
user-driven mechanism that copies a package into `data/skills`; it plays no part in resolving the
upstream skills below.

## Optional upstream skills

| Upstream skill                | Author      | Source                                                                                     | Used by                                                                       | Behavior when unavailable                                                                                                         |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `frontend-design`             | Anthropic   | https://github.com/anthropics/skills/tree/main/skills/frontend-design                      | `ui-redesign-planner`, `frontend-design-sweep`, visual `page-by-page` reviews | Uses the scoped Phase 2 review below the planner's source-selection rules; records source, reason, omissions, and evidence limits |
| `grill-with-docs`             | Matt Pocock | https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md | Interactive domain decisions; CONTEXT.md maintenance uses the procedure below | Never substitutes document maintenance for an explicitly requested interview; the maturity item stays a manual edit               |
| `vercel-react-best-practices` | Vercel Labs | https://github.com/vercel-labs/agent-skills                                                | `audit-review`, `update-audits`                                               | Fetches the official source; `audit-review` skips source comparison if unavailable and `update-audits` stops                      |
| `vercel-composition-patterns` | Vercel Labs | https://github.com/vercel-labs/agent-skills                                                | `audit-review`, `update-audits`                                               | Fetches the official source; `audit-review` skips source comparison if unavailable and `update-audits` stops                      |
| `web-design-guidelines`       | Vercel Labs | https://github.com/vercel-labs/web-interface-guidelines                                    | `audit-review`, `update-audits`                                               | Fetches the official source; `audit-review` skips source comparison if unavailable and `update-audits` stops                      |

`grill-with-docs` depends on upstream `grilling` and `domain-modeling`; follow that project's
installation and invocation instructions if you choose to use it. It is an interactive workflow,
not a prerequisite for unattended artifact maintenance.

## Context maintenance

This aidd-owned procedure is the explicit `CONTEXT.md` maintenance scope used by
`refresh-project-artifacts`, regardless of whether an interactive skill is installed. It verifies
existing language against live evidence. It does not conduct a design interview, decide disputed
domain meanings, or create architectural decisions on the owner's behalf.

1. Read the existing `CONTEXT.md`, any `CONTEXT-MAP.md`, and their links to domain contexts and
   decisions. Follow established context boundaries; do not merge distinct meanings across them.
2. Inventory domain terms and compare their definitions and relationships with live user flows,
   domain code, and existing decisions. Identify contradictions, ambiguous synonyms, and missing
   domain concepts. Code shows current behavior; it does not settle a disputed intended meaning.
3. Keep `CONTEXT.md` a domain glossary. Preserve accurate established structure and vocabulary.
   For new terms, use a concise definition and list rejected synonyms when the choice is settled.
   Keep general programming concepts, implementation notes, plans, and scratch work elsewhere.
   Create a missing glossary only when the evidence supports at least one resolved domain term.
4. Correct only evidence-backed inaccuracies. Check boundaries with concrete examples and edge
   cases. If a contradiction needs an owner decision, preserve the existing meaning, record the
   competing evidence and question in the run response, and mark that artifact blocked. Do not
   fabricate an answer, backfill interview responses, or write a new ADR to resolve it.
5. Recheck changed definitions against their evidence and linked contexts. Report the terms
   checked, corrections, unresolved decisions, and this procedure as the producer. Renew a
   timestamp or mark `reviewed-current` only after all required checks for that artifact pass.

An explicitly requested `grill-with-docs` interview requires its actual permitted workflow and
human answers. This maintenance procedure is not an equivalent substitute for that request.

## Review coverage and source freshness

Coverage reviewed on **2026-09-13**:

| Owned procedure               | Compared upstream revision                                                                                                                                                       | Preserved scope                                                                                                                                  | Intentional omissions                                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context maintenance above     | [domain-modeling at 3216582](https://github.com/mattpocock/skills/tree/321658273cb1d20b76026717d027d505790106d4/skills/engineering/domain-modeling), including CONTEXT-FORMAT.md | Glossary purpose, canonical terms, context boundaries, concrete scenarios, code contradictions, evidence-backed corrections                      | Interactive grilling, owner decisions, and ADR authoring; unresolved decisions block the affected artifact                                               |
| `ui-redesign-planner` Phase 2 | [frontend-design at 41bbe19](https://github.com/anthropics/skills/blob/41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f/skills/frontend-design/SKILL.md)                                 | Subject-specific direction, typography, palette, composition, purposeful motion, product language, accessibility, and critique against the brief | UI implementation and implementation-only CSS details; aidd adds evidence-based findings, report/feature handoff, and preservation of the existing stack |

These are scope comparisons, not a promise of perpetual upstream parity. When either owned
procedure changes or an upstream revision is adopted, compare the actual instructions and update
this record and the coverage tests together. Do not refresh merely by changing the date. A local
adaptation must be read and assessed on its own content before it is selected as a review source.

## Distribution boundary

No upstream skill source is vendored into aidd's skill catalog. Every Git-tracked file under
`skills/` is classified first-party in `licenses/distributed-materials.json`.

Three audit definitions are the exception, and they are audits rather than skills:
`audits/REACT_BEST_PRACTICES.md`, `audits/COMPOSITION_PATTERNS.md`, and
`audits/WEB_DESIGN_GUIDELINES.md` are adapted from MIT-licensed Vercel Labs sources. Each is
recorded as third-party material against a pinned upstream revision, and its notice is rendered
into `THIRD-PARTY-LICENSES.md` and `THIRD-PARTY-NOTICES.md`.

`bun run check:licenses`, which `smoke:qc` runs, enforces the boundary. It enumerates every
Git-tracked file under the catalog roots (`audits`, `skills`, `scaffolding`, `prompts`, `recipes`)
plus the public document surfaces, then fails on any distributed path the registry does not
classify and on any classified path outside that set.

Knip remains an aidd development dependency and `bun run check:dead-code` still runs it. That
package dependency is separate from agent skill distribution.

---
name: spec
description: 'Turn a rough idea, a free-form document, or an existing spec into aidd-native specification records: feature.json entries with verifiable clauses, roadmap placement, and an ordered task breakdown. Use to spec new work, decide what to build next, or upgrade an existing spec into something aidd can implement.'
metadata:
    aidd-category: recipe-maturity
    aidd-contracts: humanize-docs, prompt-guidelines
---

# Feature Specification

Produce the specification artifacts aidd actually implements from: `.aidd/features/<id>/feature.json`
records whose `spec` clauses are verifiable, placed on `.aidd/roadmap.json`, with narrative
documents only where they earn their place.

## Usage

```
spec [<idea text> | <document path> | <feature id> | what's next?]
```

- Zero args or `what's next?` → select the next unfinished work from `.aidd/roadmap.json` and the
  backlog in `.aidd/features/`, then spec that.
- `<idea text>` → free-form prose describing wanted capability. A rough dump is a valid input; the
  skill resolves it into scope rather than asking the operator to pre-structure it.
- `<document path>` → a file or directory to read as the source. Two kinds are recognized in
  Inputs below: a free-form document, or an existing specification to update.
- `<feature id>` → an existing `.aidd/features/<id>/` directory whose `spec` clauses are revised in
  place.

Several forms may be supplied together (an idea plus the document it refines). Read all of them and
treat them as one source corpus, deduplicating requirements that recur.

## Applicability

Applies to any aidd-managed project, whatever its stack. The target is the project the run is
pointed at; `.aidd/` in that project is the contract this skill writes into.

Capability work is this skill's lane. A defect report is not: route bug intake through the
`bug2feature` skill, and prose that asserts existing code is broken through `doc2feature`. Both
produce remediation records with a different naming and evidence contract. If the supplied input
mixes wanted capability with reported defects, spec the capability, and list the defect claims in
the report as work for those skills instead of silently converting them.

A project with no `.aidd/` directory is still in scope; see Fallback at the end.

## Inputs

### Resolving the source

1. **Idea text**: use it as the requirement statement.
2. **Free-form document**: notes, a handoff, an interview transcript, `.aidd/notes.md`,
   `.aidd/questions.md`, a directory of `.aidd/responses/*.md`, a meeting dump, a README section.
   Read the whole thing before extracting anything. For a directory, read every `*.md` inside it as
   one corpus and skip pure index files (a table of links with no prose).
3. **Existing specification**: a document already written as a spec, such as
   `docs/specs/<date>-<slug>/technical-spec.md`, a loose `*-spec.md` or `*_spec.md`, or a spec that
   predates the project's aidd metadata. Read it, keep every decision it already settles, and
   update it rather than restating it from scratch. What changes is what the current codebase and
   `.aidd/` contract prove wrong, missing, or already shipped.
4. **Existing feature id**: read `.aidd/features/<id>/feature.json` and revise that record. Preserve
   `id`, `createdAt`, `dependencies` that still hold, and any `spernakit_version` field already
   present. Never add `spernakit_version` to a record that lacks it; it marks template origin, not
   revision.
5. **Roadmap selection** (zero args): pick the highest-priority unfinished item, honoring milestone
   order and dependency readiness, and spec that one item only.

If the input names a target that cannot be found (missing path, unknown feature id, empty
document), stop and report the discovered candidates instead of inventing a subject.

### Loading the aidd contract

Before writing anything, read what the project already commits to:

- `.aidd/spec.md` for purpose, users, capabilities, and non-goals. A requirement that contradicts a
  stated non-goal is reported as a conflict, not quietly specced.
- `.aidd/project.md` for project-specific directives, and `.aidd/project-structure.md` when present.
- `.aidd/roadmap.json` for milestones, current milestone, and existing dependency edges.
- Every `.aidd/features/*/feature.json` as a deduplication index: id, title, description,
  `affectedFiles`, and the behaviors each `spec` already claims. Note which records carry
  `spernakit_version`; those are template-owned and are dependencies, not edit targets.
- `.aidd/screen-map.md` and `.aidd/testing-scenarios.md` when the work touches UI or user flows.

### Gathering codebase context

- Find the closest existing implementations of the same shape and read them: routes, services,
  schema, pages, hooks, and the types they share. The spec names the patterns the project already
  uses, not generic ones.
- Identify the exact files the work lands in, including registration points (route assembly, nav
  config, route table, migration location).
- Review git history for comparable features: what the project settled on, and what it reverted.

## Workflow

### 1. Resolve requirements

- Infer the smallest complete scope that delivers the capability end to end. No library code
  without a consumer, no surface without its wiring.
- Record material assumptions, and any residual product choice that does not block implementation.
- Choose conservative defaults that preserve current behavior and architecture.
- Never leave a placeholder that prevents implementation from starting.
- Check the deduplication index before writing: if an existing record already covers the
  requirement, revise that record instead of adding a second one, and say so in the report.

### 2. Decide the record shape

- One coherent capability → one feature record.
- A capability that only makes sense as several independently verifiable pieces → several records,
  wired to each other through `dependencies` in the order they must ship.
- A revision of existing scope → edit the existing record in place.

Split when a piece can be verified on its own and shipped on its own. Do not split a single
end-to-end wiring into layer-shaped fragments that cannot each be verified alone.

### 3. Write the feature records

Location: `.aidd/features/<id>/feature.json`, one directory per record, directory name equal to
`id`.

The id is a clean descriptive kebab-case slug: lowercase letters, digits, single hyphens, no date
and no prefix. `feature-<date>-<slug>` is not the convention for new capability work; `remediation-`
and `audit-` prefixes name process records owned by the bug and audit flows and must not be used
here.

```json
{
	"affectedFiles": ["{project-root-relative path}"],
	"category": "{UI|Backend|Database|Security|Core}",
	"createdAt": "{ISO timestamp}",
	"dependencies": [],
	"description": "{1-2 sentences: what it is and the value it delivers}",
	"id": "{slug}",
	"notes": "{provenance: source document path, idea origin, or prior spec revised}",
	"passes": false,
	"priority": 3,
	"spec": "1. Verify ...\n2. Verify ...\n3. Verify ...",
	"status": "backlog",
	"title": "{concise title naming the capability}",
	"updatedAt": "{same as createdAt on creation; current time on revision}"
}
```

Formatting rules:

- Tabs for indentation. Newlines inside `spec` are `\n` escapes within the single string value.
- Keys are sorted alphabetically, which is what the repository formatter produces for
  `feature.json`. `dependencies` and `affectedFiles` are always arrays.
- Priority is 1 to 5: 1 blocks other work or ships the milestone, 3 is normal scoped work, 5 is
  cosmetic or deferrable. Priority is earned by impact, not assigned uniformly.
- Do not add fields beyond those shown.

Writing `spec` clauses, the part aidd runs on:

- Every clause starts with `Verify` and states one checkable fact about the finished system.
- Name the actual file, route, table, component, command, or observable result. Paths are
  project-root relative, never relative to the reader.
- Cover the full stack the capability touches: data model, backend behavior and its error paths,
  API contract, UI state including empty and failure states, access control where the project has
  roles, and the check that proves it is wired end to end.
- A clause a reviewer cannot fail is not a clause. "Verify the page works" and "Verify the feature
  is implemented" are rejected.

### 4. Place the work on the roadmap

Specification is not complete until every record written or created is assigned in
`.aidd/roadmap.json`.

- Set `roadmap.features["<id>"] = { "milestone": "<target>", "dependencies": [...] }`, merging with
  any existing entry rather than replacing it.
- Default to the current milestone: the highest-priority active milestone. Assign a later milestone
  only when the source or the project owner scoped the work to a later release. Never auto-create a
  milestone.
- If `.aidd/roadmap.json` does not exist, create it first with a single `v1.0` milestone at
  priority 1 mapping every existing feature directory and preserving its dependencies, then assign.
- Do not shell out to propagate the assignment. aidd applies the roadmap at the end of the run and
  reports what it updated.

### 5. Write narrative documents only where they earn it

- Revising a supplied specification document: update that file in place. Keep its structure and
  headings, correct what the codebase disproves, mark shipped parts as shipped, and add the
  requirements the feature records now carry. Do not fork a second copy under a new date.
- A supplied document is `.aidd/spec.md`: confine the edit to the capability being specced (a
  capability line, a non-goal, a corrected statement). A full rewrite of that file belongs to the
  `review-or-create-doc` skill, which owns it.
- Work spanning several feature records, or carrying architecture decisions the records cannot
  hold: write `docs/specs/<YYYY-MM-DD>-<kebab-slug>/technical-spec.md` (overview, architecture
  integration, implementation approach with the patterns found in the codebase, technical
  requirements by layer, acceptance criteria) and `tasks.md` (ordered implementation steps and the
  quality gates: zero lint errors, tests passing, build successful, integration verified). Use a
  slug of at most five words. Reference the feature ids from both, and reference the document from
  each record's `notes`.
- A single feature record needs no companion document. The record is the specification.

### 6. Humanize the prose

Prose written here follows the humanize-docs style contract
(`.aidd/skills/humanize-docs/SKILL.md`, staged into this workspace; or
`<aidd-root>/skills/humanize-docs/SKILL.md` in the aidd repo): plain natural language, no
em-dashes, no AI filler (delve, leverage, robust, seamless). Descriptions, `spec` clauses,
acceptance criteria, and technical constraints stay exact and testable; humanizing never softens a
requirement into something unverifiable.

### 7. Validate

- Re-read every file written and confirm it parses. Ids are unique, each directory holds a
  `feature.json`, each `dependencies` entry names an existing feature directory, and no dependency
  cycle was introduced.
- Confirm the scope is consistent with the project's architecture, and feasible against the code
  actually read.
- Check every written artifact against the prompt-guidelines pre-send checklist
  (`.aidd/skills/prompt-guidelines/SKILL.md`, staged; or `<aidd-root>/skills/prompt-guidelines/SKILL.md`
  in the aidd repo): the goal fits one sentence, exact files, symbols, and commands are named or
  exploration is explicitly allowed, constraints and forbidden actions are stated, every acceptance
  criterion is checkable by a named command or observable result, and no unrelated "also" task
  rides along.
- When the run targets the aidd repository itself, run
  `bun run start -- --project-dir . --check-features` and report the result.

### 8. Report

- Every record written or revised: id, title, category, priority, milestone, and file path.
- Requirements from the source that were deliberately not specced, and why (out of scope per
  `.aidd/spec.md`, already covered by an existing record, defect work for `bug2feature` or
  `doc2feature`, blocked on a missing capability).
- Assumptions made and the residual product choices left open.
- Key technical decisions, the patterns adopted from the codebase, and any conflict found with a
  stated non-goal.
- The next step: implement the highest-priority ready record, or run `feature-review` to audit spec
  quality first.

## Fallback for projects without aidd metadata

If the target has no `.aidd/` directory, do not scaffold one as a side effect of a spec request.
Write the `docs/specs/<YYYY-MM-DD>-<kebab-slug>/` pair described in step 5, keep the same rules for
verifiable acceptance criteria and named files, and report that feature records were not written
because the project is not aidd-managed.

# Dance Session Report Template

Written in D5 to `<applications-root>/devdiary/entries/YYYY/MM/DD-dance-session.md`, alongside
D4's daily diaries rather than in place of them.

```markdown
# Dance Session: YYYY-MM-DD

**Bump**: spernakit v{prev} → v{new} ({patch|minor})
**Rationale**: {one-line summary of the auto-decided rationale}
**Scope**: {apps processed}
**Out of scope**: {apps excluded or dropped, with reasons; or none}
**Parts run**: {parts run and parts skipped, with reasons}
**Wall time**: {elapsed}

## Per-app status

| App | Scope | A   | B   | D1 supertest | D2 smoke:qc | D3 tag | Notes |
| --- | ----- | --- | --- | ------------ | ----------- | ------ | ----- |
| ... | in    | ok  | ok  | ok           | ok          | v0.0.0 | ...   |

## Direct remediation (Part B)

- {bug title}: fixed at {template path} ({apps affected})

## Formal issue features (Parts B and C)

**Part C**: {completed | no-op (0 features) | skipped, with reason}

- {feature path}: {template-owned Part C result, or app-owned disposition}

## supertest results (Part D1)

| App | Result | Crawl assertions | Screenshots |
| --- | ------ | ---------------- | ----------- |

## smoke:qc results (Part D2)

{Per-app results, or a note that D1's in-run smoke:qc satisfied this phase and where its log lines are.}

## Backport candidates for the next template release

- {finding, its template path, and why it was not fixed in this run}

## Open owner decisions

- {decision, affected scope, and why it remains open; or none}

## Lessons learned

- {anything new that should fold back into the operator's standing dance-orchestration norms}
```

Record every scope decision the run made, not only the apps it processed. An app dropped at preflight
for already being at the target, a Part skipped by owner decision, and a tag deliberately left to the
owner all belong in the header, the per-app table, or the open-decisions section. A report that lists
nine apps when the fleet has ten reads as an omission rather than a decision.

Use the checkpoint's status values (`pending`, `ok`, `failed`, or `skipped`) for A, B, D1, and D2.
Part C has no per-app field because it works the template backlog. Record its phase-wide result above
the formal feature list. Put the tag string from `D3_tagged` in the D3 column, or state why it is
null. Include out-of-scope apps in the table or name every one in the header.

The status tables are the point of this artifact; keep them. Prose lines (rationale, remediation
descriptions, lessons) follow the humanize-docs style contract
(`.aidd/skills/humanize-docs/SKILL.md`, staged into this workspace; or
`<aidd-root>/skills/humanize-docs/SKILL.md` in the aidd repo): flat factual statements, no aphorisms
or lesson-lines, no AI filler.

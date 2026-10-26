# Not a Feature (check 3i and Fix Rule 15)

A feature record describes a lasting capability of the product: behavior, a contract or a check
that has to keep holding. A one-off change to content, data or metadata is not one, whatever its
name: move or reschedule drafts, compress or delete an image, fix a set of paths, rename a field,
tidy a config, remove dead code.

## The check

Read each record's title, description and spec, not its directory name, and ask what would stop
holding if the record disappeared. If nothing would, because the change leaves no requirement
behind once it is made, the record is **NOT A FEATURE**.

The check covers every record that is not a finding. A finding is classified as
`consolidate-features` Phase 1 does it: a non-empty `auditSource`, a generated
`audit-{name}-{digits}-` id, or a `remediation-*` directory. A product feature named `audit-logs`
is not a finding, so it is checked here. Findings are work items that `consolidate-features` folds
or removes once they are completed.

A record that mixes the two keeps its lasting requirement; Fix Rule 15 removes only its one-off
steps.

## Fix Rule 15

Applies to every status except `in_progress`, and is the one exception to the rule that only
backlog records are rewritten.

Before removing any record, copy its `feature.json` byte-for-byte to
`.aidd/reports/feature-review/removed-{YYYY-MM-DD}/{id}.feature.json`, and name that path in the
report. A gitignored `.aidd` has no history to recover a record from.

- **Done** (`completed`, or the change is already present): add a dated entry to
  `.aidd/CHANGELOG.md` naming the record's id, what changed and its evidence. Then remove the
  record and its roadmap entry together, through the web feature delete, or by removing the
  directory and deleting its `roadmap.features` key in the same edit. Never leave a roadmap entry
  behind for a removed directory.
- **Not done**: report it, remove nothing. The change still has to happen, and an open record is
  what aidd counts: the project's incomplete total, its milestone and its roadmap all read it. A
  report or task list off the feature tree is not counted, so moving open work there hides it.
  On 2026-10-25 six open v1.0 acceptance records moved to a task list and the milestone's open
  count fell from 12 to 6 with none of the work done (Room #23297). Put the record in the report
  as a question for the project's owner: keep it, reshape it into a lasting requirement, or turn
  it into a finding for a coding run.
- **Mixed**: remove only the one-off spec steps and keep the record. Add a dated changelog line
  naming the record and the steps removed, since this rewrites a spec that may be completed.
- **Report only**, removing nothing, when the record is `in_progress` (a run may hold it) or another
  record lists it in `dependencies`. Name the run or the dependants.

## Report section

```markdown
### NOT A FEATURE (one-off changes recorded as features)

#### {feature-title} (`{feature-id}`) - {status}

- What it changed or would change: {one sentence}
- Disposition: {cleared: changelog entry, record removed | reported only: not done, question for
  the owner | mixed: one-off steps removed | reported only: in progress, or depended on by {ids}}
```

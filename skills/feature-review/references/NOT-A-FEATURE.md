# Not a Feature (check 3i and Fix Rule 15)

A feature record describes a lasting capability of the product: behavior, a contract or a check
that has to keep holding. A one-off change to content, data or metadata is not one, whatever its
name: move or reschedule drafts, compress or delete an image, fix a set of paths, rename a field,
tidy a config, remove dead code.

## The check

Read each record's title, description and spec, not its directory name, and ask what would stop
holding if the record disappeared. If nothing would, because the change leaves no requirement
behind once it is made, the record is **NOT A FEATURE**.

The check covers clean-slug records. `remediation-*` and `audit-*` records are findings: work items
that `consolidate-features` folds or removes once they are completed.

A record that mixes the two keeps its lasting requirement; only its one-off steps are reported.

## Fix Rule 15

Applies to every status except `in_progress`, and is the one exception to the rule that only
backlog records are rewritten.

- **Done** (`completed`, or the change is already present): add a dated entry to
  `.aidd/CHANGELOG.md` naming the record's id, what changed and its evidence. Then remove the
  record and its roadmap entry together, through the web feature delete, or by removing the
  directory and deleting its `roadmap.features` key in the same edit. Never leave a roadmap entry
  behind for a removed directory.
- **Not done**: remove the record the same way, and put the change in the report as a task or
  question for the project's owner, saying what it needs. The owner decides whether it becomes a
  finding for a coding run.
- **Mixed**: remove only the one-off spec steps and keep the record.
- **Report only**, removing nothing, when the record is `in_progress` (a run may hold it) or another
  record lists it in `dependencies`. Name the run or the dependants.

## Report section

```markdown
### NOT A FEATURE (one-off changes recorded as features)

#### {feature-title} (`{feature-id}`) - {status}

- What it changed or would change: {one sentence}
- Disposition: {cleared: changelog entry, record removed | task or question for the owner, record
  removed | mixed: one-off steps removed | reported only: in progress, or depended on by {ids}}
```

---
name: loopover
description: 'Run one slash command or instruction once per matching file. Use when the same review, validation, or edit has to be applied across a set of files (e.g. every *.md, every feature.json) instead of one at a time.'
metadata:
    aidd-category: general
---

# Loop Over Files

Expand a file pattern into a concrete list, then run the same payload once per file, substituting
the file path into the payload. Each item runs in isolation so a large sweep does not consume the
main context.

## Usage

```
/loopover --files *.md --recursive --execute "/review-doc {}"
/loopover --files *.json --recursive --execute "validate structure and order keys in {}"
/loopover --files "docs/**/*.md" --execute "/review-doc {}" --parallel 6
/loopover --files *.ts --path src --exclude "*.test.ts" --execute "add missing JSDoc to {}" --dry-run
/loopover --changed --execute "/review {}" --yes
```

## Arguments

| Flag                    | Meaning                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--files <glob>`        | Pattern to match. Repeatable, or comma-separated. Quote patterns containing `**` or spaces.                      |
| `--path <dir>`          | Root the search here instead of the working directory.                                                           |
| `--recursive`           | Search subdirectories. `*.md --recursive` is equivalent to `**/*.md`. Without it, only the root level matches.   |
| `--exclude <glob>`      | Drop matches. Repeatable.                                                                                        |
| `--changed`             | Use files changed vs. the merge-base with the main branch instead of a glob. Combinable with `--exclude`.        |
| `--execute "<payload>"` | Required. A slash command (starts with `/`) or a plain-English instruction. `{}` is replaced with the file path. |
| `--parallel <n>`        | Concurrent items. Default `4`. `--parallel 1` is strictly sequential.                                            |
| `--inline`              | Run every item in the main context instead of delegating. Only for small loops or when items must share state.   |
| `--limit <n>`           | Process at most the first N matches (after sorting). Report what was skipped.                                    |
| `--dry-run`             | Resolve and print the file list and the expanded payload for the first item, then stop.                          |
| `--yes`                 | Skip the confirmation gate.                                                                                      |
| `--stop-on-error`       | Abort the sweep on the first failing item. Default is to continue and report failures.                           |
| `--report <path>`       | Also write the summary table to this file.                                                                       |

### Placeholders

`{}` is the repo-relative file path. Also available: `{name}` (basename), `{stem}` (basename without
extension), `{dir}` (containing directory), `{abs}` (absolute path). A payload with no placeholder
gets the path appended.

## Workflow

1. **Resolve the file list.** Use the Glob tool — never rely on shell glob expansion, which behaves
   differently in PowerShell than in bash. Apply `--path`, `--recursive`, then `--exclude`. Always
   exclude `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, and `*.old`/`.old/` directories
   unless the user's pattern targets them explicitly. Sort the result deterministically (path order)
   so reruns are comparable. For `--changed`, use `git diff --name-only` against the merge-base and
   drop deleted paths.

2. **Report the plan.** Print the count and the list (first 30, then `… and N more`). If the list is
   empty, say so and stop — do not broaden the pattern to find something to do.

3. **Safety cap.** Downgrade the run to a dry run — report the plan, execute nothing — when both
   are true:
    - more than 10 files matched, and
    - the payload mutates files (edits, reformats, reorders, rewrites) rather than only reporting.

    `--yes` lifts the cap. State plainly that the cap fired and that `--yes` reruns it for real. When
    the working tree is dirty and the payload mutates files, say so in the report — never run
    `git stash`.

4. **Execute per item.** For each file, substitute the placeholders, then:
    - **Slash-command payload** (`/review-doc {}`): resolve the leading token to a skill and run it
      with the substituted path as its argument. If no skill of that name exists, stop and report it —
      do not silently treat it as prose.
    - **Instruction payload**: carry out the instruction against that one file.

    Default execution is one subagent per file, `--parallel` at a time. Delegation is intrinsic to
    this skill — invoking `/loopover` authorizes it. Give each subagent the substituted payload, the
    single file it owns, and an instruction to return a compact result: status, one-line summary, and
    a list of any files it changed. It must not touch files outside its assignment.

    With `--inline`, do the work directly in the main context, one file at a time.

5. **Summarize.** Emit a table: file, status (`ok` / `changed` / `no-op` / `failed`), one-line note.
   Follow it with totals, then the failures in full. Write the same content to `--report <path>` when
   given.

## Rules

- One file per item. Do not batch several files into one subagent, even when they look similar —
  the point of the loop is that each file gets a full pass.
- Never expand scope beyond the resolved list. If an item reveals a problem in a file outside the
  list, report it in the summary rather than fixing it.
- Report failures as failures. A sweep where 6 of 40 items failed is a sweep with 6 failures, not a
  success with caveats.
- Do not re-run failed items automatically. Report them so the user can rerun with a narrower
  `--files`.
- Preserve the payload's own semantics. If the target skill is review-only, loopover does not make
  it write.

## Completion Criteria

- Every resolved file has exactly one row in the summary.
- Counts reconcile: matched = processed + skipped-by-limit.
- Any file the sweep modified is named in the summary.

# Prompt Selection Logic

aidd compiles prompts from the current run plan. The selected mode, backend, filters, and
feature context determine the final prompt.

## Selection Order

The CLI parser records flags, then `resolveRunPlan` selects the plan shape. Important branches:

| Trigger                                      | Prompt behavior                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `--prompt` / `--skill`                       | Selects directive mode; the custom or compiled prompt replaces the base mode prompt. |
| `--director`                                 | Uses director prompt and schema paths.                                               |
| `--interview [FILE]`                         | Uses interview prompt for the next question.                                         |
| `--audit` or `--audit-all`                   | Uses audit prompt and audit definitions.                                             |
| `--todo`                                     | Uses todo prompt and todo-file discovery.                                            |
| `--validate`                                 | Uses validate prompt for incomplete metadata.                                        |
| `--in-progress`                              | Resumes in-progress feature work.                                                    |
| no special mode                              | Uses coding prompt for selected feature work.                                        |
| `--triumvirate` with an allowed mutating run | Wraps the normal plan in planning and execution stages.                              |

Check-only commands such as `--check-features` and `--check-artifacts` do not compile agent
prompts.

## Feature Context

Feature-backed prompts include the selected feature and completion contract. Selection applies:

- `--feature VALUE`
- `--milestone VALUE`
- `--filter-by FIELD --filter VALUE`
- dependency checks
- status checks

`waiting_approval` features are skipped. A feature with unmet dependencies is skipped until every
dependency has `passes: true`.

## Backend Fragments

The compiler appends backend-specific instructions from `prompts/_cli/{backend}.md` when present.
These fragments adapt tool guidance for:

- `native`
- `claude-code`
- `cline`
- `opencode`
- `kilocode`
- `codex`
- `grok`

`ollama` and `lmstudio` use native backend behavior with their respective provider
configuration (both resolve to the `native.md` fragment).

## Result Contracts

Mutating feature work expects exactly one structured completion marker:

```text
AIDD_RESULT: {"featureId":"<selected-feature-id>","status":"completed","passes":true}
```

Audit mode expects audit result JSON. Batched audit mode expects `auditReports[]`.

Explicit `--audit NAME[,NAME]` selects the named audits immediately, even when matching audit
reports already exist. `--audit-all` selects only discovered audits that do not already have a real
report.

Director mode writes the configured director output JSON instead of feature metadata. When
`--director-context PATH` is provided, the director prompt reads that extra profile/chat
context once and treats it as prioritization guidance without changing the JSON output contract.
Interview mode writes response artifacts and is intended to be read-only against source code.

## Snapshot Maintenance

Prompt snapshots are the safety net for compiler changes:

```powershell
bun run prompt:snapshot
```

Update snapshots in the same change as intentional compiler or prompt changes.

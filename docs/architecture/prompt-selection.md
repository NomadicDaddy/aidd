# Prompt Selection Logic

aidd compiles prompts from the current run plan. The selected mode, backend, filters, and
feature context determine the final prompt.

## Selection Order

The CLI parser records flags, then `resolveRunPlan` (`cli/src/plan/resolve.ts`) selects the plan
shape. `selectMode` takes the **first** matching branch, in this order:

| Trigger                                               | Mode        | Prompt behavior                                                             |
| ----------------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| `--director`                                          | `director`  | Uses the director prompt and the configured fleet-summary/output paths.     |
| `--audit` or `--audit-all`                            | `audit`     | Uses the compiled audit prompt and audit definitions.                       |
| `--interview [FILE]`                                  | `interview` | Uses the interview prompt for the next question.                            |
| `--todo`                                              | `todo`      | Selects the first unchecked item in `.aidd/todo.md`.                        |
| `--validate`, `--check-features`, `--check-artifacts` | `validate`  | Uses the validate prompt to re-check incomplete features and pending todos. |
| `--directive`, `--prompt`, `--skill`                  | `directive` | The custom or skill-compiled prompt replaces the base mode prompt.          |
| no special mode                                       | `coding`    | Uses the coding prompt for selected feature work.                           |

Because directive is the last branch, `--prompt` does not override an earlier mode flag: combining
it with `--director` still resolves to director mode.

`--in-progress` is not a mode. It sets the prompt phase to `in-progress` (so the base fragment
becomes `prompts/in-progress.md`) and adds a `status = in_progress` feature filter, while the mode
stays whatever the table above resolved — normally `coding`. A custom prompt likewise forces the
phase to `directive`.

`--triumvirate` does not change the mode either. It wraps the resolved plan in two competing
read-only planning stages (primary and secondary, run against a planning mirror), an overseer
decision, then an execution stage. It requires a secondary and an overseer CLI (from flags or the
`triumvirate` config block) and is rejected outright when combined with `--director`,
`--interview`, `--check-features`, or `--check-artifacts`.

Check-only runs (`--check-features`, `--check-artifacts`) resolve to validate mode but return from
`handlePreRunChecks` before any agent invocation, so they compile no prompt. They also skip asset
scaffolding, which is what makes them safe to run against a live checkout.

## Feature Context

Feature-backed prompts include the selected feature and completion contract. Selection applies:

- `--feature VALUE`
- `--milestone VALUE`
- `--filter-by FIELD --filter VALUE`
- dependency checks
- status checks

Ineligible features are filtered out before ranking (`selectFeatureCandidates` in
`shared/src/metadata/features/query.ts`):

- Features with `passes: true` or `status: completed` are skipped.
- `waiting_approval` features are skipped.
- Audit-finding features are skipped unless the run targets one explicitly (`--feature audit-…`,
  or `--filter-by id --filter audit-…`) or opts into the sweep with `--audit-findings [SOURCE]`.
- A feature with unmet dependencies is skipped until every dependency is `status: completed` **and**
  `passes: true`.

What survives is ranked `in_progress` first, then by ascending `priority`, then by directory or id.

## Backend Fragments

The compiler prepends backend-specific instructions from `prompts/_cli/{backend}.md` when present.
These fragments adapt tool guidance for:

- `native`
- `claude-code`
- `cline`
- `opencode`
- `kilocode`
- `codex`
- `grok`

`ollama`, `lmstudio`, and `openai` all run through the in-process NativeBackend and resolve to the
`native.md` fragment; no per-provider file exists. Interview mode is compiled without any backend
fragment.

## Result Contracts

Mutating feature work expects exactly one structured completion marker:

```text
AIDD_RESULT: {"featureId":"<selected-feature-id>","status":"completed","passes":true}
```

Other modes carry their own marker shape: `{"todoCompleted":true}` for todo mode,
`{"directiveCompleted":true}` for directive mode, `{"responseMarkdown":"…"}` for interview mode,
and `{"directorOutputWritten":true}` for director mode. The `initializer` and `onboarding` phases
get no result contract at all, because their completion is detected rather than reported.

Directive completion requires `directiveCompleted: true` and a successful backend exit; files,
timestamps, commits, and unrelated JSON markers do not substitute for that result. Partial or
blocked directives emit `{"directiveCompleted":false,"reason":"..."}` and end with a non-success
blocked outcome. An explicitly documented scoped replacement may satisfy the requested work,
but its source, omissions, and evidence limits must be disclosed. It does not certify that the
upstream skill executed.

Audit mode expects audit result JSON (`auditFindings[]` plus `reportMarkdown`). Batched audit mode
expects `auditReports[]`, one entry per selected audit name.

Explicit `--audit NAME[,NAME]` selects the named audits immediately, even when matching audit
reports already exist. `--audit-all` discovers the audit catalog, drops audits that do not apply to
the project profile, ranks the rest by change potential, and then selects only those whose latest
report is missing or stale — a report goes stale on age or on enough code churn since it was
written, so an existing report does not by itself exclude an audit.

Director mode writes the configured director output JSON instead of feature metadata. When
`--director-context PATH` is provided, the director prompt reads that extra profile/chat
context once and treats it as prioritization guidance without changing the JSON output contract.
Interview mode writes response artifacts and is intended to be read-only against source code.

Snapshot coverage for these modes lives with the compiler: see
[prompt-compiler.md](./prompt-compiler.md) § Snapshot tests for the matrix, what is omitted from
it, and when to regenerate.

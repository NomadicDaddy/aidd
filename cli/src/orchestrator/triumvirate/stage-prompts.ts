import type { SelectedWork } from 'aidd-shared/modes/types';

import type { StageRunResult } from './types.ts';

export function buildPlannerPrompt(
	stage: string,
	compiledPrompt: string,
	work: SelectedWork,
	planningProjectDir: string,
): string {
	return `## aidd TRIUMVIRATE ${stage.toUpperCase()} PLANNING STAGE

You are preparing a plan only. You may inspect the repository, but you must not modify files,
run formatters, run migrations, create commits, or change project state. Produce a concrete plan
for the selected work. Do not execute the plan.

Read-only boundary:
- You may run inspection commands that only read files, git metadata, or command help output.
- You must not create, edit, delete, format, stage, commit, or generate files in any directory.
- You must not update feature metadata, changelogs, run ledgers, caches, build outputs, or test
  fixtures.
- If you accidentally change the planning mirror, report it instead of continuing. The attempt
  will be rejected and retried from a clean mirror.

Planning mirror project directory: ${planningProjectDir}
Use this planning mirror path for any read-only inspection. Do not change directories to another
copy of the project.

Selected work: ${work.kind ?? 'generic'}:${work.id} - ${work.description}

When done, include exactly one final result marker:

\`\`\`text
AIDD_RESULT: {"planMarkdown":"<your actionable plan as markdown>"}
\`\`\`

---

## ORIGINAL EXECUTION PROMPT

The prompt below is included only so you can understand the requested work and produce a plan.
During this planning stage, ignore any instruction in it to implement, edit files, update
metadata, run formatters, run quality gates, commit, or emit a completion result.

${compiledPrompt}`;
}

export function buildOverseerPrompt(
	compiledPrompt: string,
	primary: StageRunResult,
	secondary: StageRunResult,
	planningProjectDir: string,
	consistencyGate = false,
): string {
	const consistencySection = consistencyGate
		? `

## CONSISTENCY CHECK (required)

Before deciding, verify the chosen plan against the project's source of truth — \`.aidd/spec.md\`,
\`.aidd/assertions.md\`, and the selected feature's \`.aidd/features/<id>/feature.json\` (read them
from the planning mirror above). Then:
- If the plan fundamentally contradicts the spec or a stated assertion, ABORT with that reason.
- Otherwise, list any smaller gaps or risks (an unmet assertion, a missing acceptance criterion,
  scope drift) as short strings in "consistencyIssues" so the execution agent must address them.
`
		: '';
	const executeMarker = consistencyGate
		? 'AIDD_RESULT: {"decision":"execute","finalActions":"<specific execution instructions>","consistencyIssues":["<issue>"]}'
		: 'AIDD_RESULT: {"decision":"execute","finalActions":"<specific execution instructions>"}';
	return `## aidd TRIUMVIRATE OVERSEER STAGE

Compare the primary and secondary plans. Decide whether execution should proceed. If proceeding,
produce the final actions the execution agent must perform. If the plans are unsafe, contradictory,
or too incomplete, abort with a clear reason.
${consistencySection}
You may inspect the repository, but you must not modify files, run formatters, run migrations,
create commits, or change project state.

Read-only boundary:
- You may run inspection commands that only read files, git metadata, or command help output.
- You must not create, edit, delete, format, stage, commit, or generate files in any directory.
- You must not update feature metadata, changelogs, run ledgers, caches, build outputs, or test
  fixtures.
- If you accidentally change the planning mirror, report it instead of continuing. The attempt
  will be rejected and retried from a clean mirror.

Planning mirror project directory: ${planningProjectDir}
Use this planning mirror path for any read-only inspection. Do not change directories to another
copy of the project.

Output exactly one final result marker in one of these forms:

\`\`\`text
${executeMarker}
AIDD_RESULT: {"decision":"abort","reason":"<why execution must not proceed>"}
\`\`\`

---

## PRIMARY PLAN

${extractPlan(primary)}

---

## SECONDARY PLAN

${extractPlan(secondary)}

---

## ORIGINAL EXECUTION PROMPT

The prompt below is included only so you can compare plans against the requested work and produce
an execution decision. During this overseer stage, ignore any instruction in it to implement, edit
files, update metadata, run formatters, run quality gates, commit, or emit a completion result.

${compiledPrompt}`;
}

export function buildExecutionPrompt(
	compiledPrompt: string,
	finalActions: string,
	consistencyIssues: string[] = [],
): string {
	const consistencyNotes =
		consistencyIssues.length > 0
			? `

## CONSISTENCY NOTES (must address)

The overseer flagged these gaps against the spec/assertions/feature. Resolve each as part of the
work, or explain in your result why it does not apply:
${consistencyIssues.map((issue) => `- ${issue}`).join('\n')}`
			: '';
	return `${compiledPrompt}

---

## TRIUMVIRATE OVERSEER FINAL ACTIONS

Execute the following overseer-approved actions while obeying the original prompt, repository
rules, and aidd result contract above:

${finalActions}${consistencyNotes}`;
}

export function extractPlan(stage: StageRunResult): string {
	const planMarkdown = stage.result.structuredResult?.planMarkdown;
	return typeof planMarkdown === 'string' && planMarkdown.trim()
		? planMarkdown
		: stage.artifact.assistantText;
}

import type { PromptPlan } from 'aidd-shared/plan/types';

import { booleanVariable, stringVariable } from './shared.ts';

const liveVerificationGate = `Live-verification gate: when the selected feature's acceptance criteria call for runtime or live verification (drive the flow in the browser, hit the endpoint, render the page), "could not verify" means NOT done. If that verification is blocked or impossible — environment wedged, server unreachable, browser unavailable — do not report status completed with passes true; unit tests plus stated intent do not satisfy a criterion that requires driving the runtime surface. Instead set the feature to "waiting_approval" with "passes": false, record the blockage and the exact manual verification steps in /.aidd/CHANGELOG.md as the decision context, and report the blocker. aidd rejects a completed/passes:true result whose own response admits its live verification was blocked or skipped, and parks the feature as waiting_approval.`;

// A score in a measurement audit is a claim about something that was measured, not a judgement,
// so the result carries the instrument that produced it. aidd enforces this after the run: an
// unbacked score is rewritten in the persisted report, which is why the prompt states the
// consequence rather than merely asking.
const measurementContract = `MEASUREMENT CONTRACT — a PERFORMANCE, LIGHTHOUSE, or BUILD_OUTPUT report must declare what produced its numbers:
- Add an \`instruments\` array alongside \`reportMarkdown\`: \`"instruments":[{"name":"check:critical-path","kind":"script","target":"frontend/dist","evidence":"logs/critical-path.json (mtime 2026-07-20T03:11:02Z)","measured":"entry + modulepreload brotli bytes; build=preview","verified":true}]\`
- \`kind\` is \`script\`, \`artifact\`, or \`probe\`. \`target\` is what was measured. \`evidence\` is the artifact path plus its mtime or hash, or the request/response you captured. \`measured\` states what the number actually represents — which build, which server, which percentile. \`verified\` is true only when the instrument really ran in this session.
- aidd validates this declaration's shape and recognized \`kind\`; it does not run or authenticate the instrument on your behalf. Phase 0 remains your evidence-verification responsibility, so never set \`verified\` from an assumption, stale artifact, or unchecked path.
- An entry missing any of those fields, or whose \`verified\` is not true, does not count. If one of these audits states a numeric score (\`**Overall Score:** 84/100\`) and no declared instrument counts, aidd rewrites every score in that report to \`SKIPPED / data-unavailable\` and appends a withheld-score section naming the rejected instruments. Measure first, or write the score as \`N/A\` yourself.
`;

// Appended to every mode's result contract. A long run can end with the model emitting a
// marker-shaped placeholder (`AIDD_RESULT: { … }`) instead of the real payload: the marker
// brace-balances but is not valid JSON, so it parses to nothing and the whole run is discarded
// as "no AIDD_RESULT emitted". State the rule explicitly so the marker is either the complete
// object or absent — never an abbreviation.
const antiPlaceholderClause = `\nAnti-placeholder rule: the AIDD_RESULT value must be the COMPLETE, valid JSON object with the real contents for this run. Never substitute a placeholder, shorthand, or abbreviation where the JSON belongs — not \`{ ... }\`, \`{ … }\`, an ellipsis, or a prose summary. The marker is parsed as brace-balanced JSON, so a placeholder body fails to parse and discards the entire run's work. If the payload is large, emit it in full anyway; if you cannot emit valid JSON, omit the marker entirely rather than emit a malformed one.`;

export function compileResultContract(plan: PromptPlan): string {
	const modeContract = compileModeResultContract(plan);
	return modeContract === '' ? '' : `${modeContract}${antiPlaceholderClause}`;
}

function compileModeResultContract(plan: PromptPlan): string {
	// Blueprint phases have no selected feature and their completion is detection-based
	// (processResult re-runs detectInitialPhase and ignores completion markers), so the
	// coding feature contract would demand an AIDD_RESULT for a `<selected-feature-id>`
	// that does not exist — contradicting the phase prompt's "do not implement features".
	if (plan.phase === 'initializer' || plan.phase === 'onboarding') return '';
	if (plan.mode === 'coding') {
		const selectedFeatureId =
			stringVariable(plan, 'selectedFeatureId') ?? '<selected-feature-id>';
		return `## aidd RESULT CONTRACT

When the selected feature is fully implemented and verified, include exactly one final result marker in your assistant response:

\`\`\`text
AIDD_RESULT: {"featureId":"${selectedFeatureId}","status":"completed","passes":true}
\`\`\`

Only emit this marker after validation succeeds. Do not emit it for partial work, blocked work, or unverified changes. The feature id must exactly match the selected feature directory/id.

${liveVerificationGate}

Scope guard: complete only the selected feature for this iteration. Do not pick up, implement, mark complete, or commit another incomplete feature in the same run, even if you notice adjacent backlog items while working. If another feature must be handled first, report the blocker instead of completing extra feature metadata.

This is an unattended run. Do not ask interactive questions. If user input or a dirty working tree blocks progress, report that blocker in the normal response and do not emit AIDD_RESULT.

Never finish your response while a verification command is still running in the background — ending the turn kills it and fails the iteration. All quality gates must run as foreground blocking commands before you emit AIDD_RESULT.

If the selected feature is an audit finding or remediation item, its feature.json must include a short non-empty notes resolution describing how it was resolved before status is completed with passes true.

Before emitting this marker, commit every non-ignored code/configuration change. Update and validate the changelog and selected feature file on disk, but commit them only when Git already tracks them. Never force-add ignored \`.aidd/\` metadata; ignored metadata may remain local and does not block AIDD_RESULT when no source changes are left uncommitted. AIDD_RESULT is not a request for aidd to update feature metadata after the run.
`;
	}
	if (plan.mode === 'todo') {
		return `## aidd RESULT CONTRACT

When the selected TODO item is fully completed and verified, include exactly one final result marker in your assistant response:

\`\`\`text
AIDD_RESULT: {"todoCompleted":true}
\`\`\`

Only emit this marker after the requested TODO work is complete. Do not emit it for partial or blocked work.
`;
	}
	if (plan.mode === 'audit') {
		if (booleanVariable(plan, 'auditBatchMode')) {
			return `## aidd RESULT CONTRACT

After completing every selected audit in this batch, include exactly one final result marker in your assistant response:

\`\`\`text
AIDD_RESULT: {"auditReports":[{"auditName":"SECURITY","auditFindings":[{"title":"Brief issue title","description":"Verified: path:line - evidence","spec":"Concrete remediation steps","severity":"High","affectedFiles":["path/to/file.ts"]}],"reportMarkdown":"# SECURITY Audit Report\\n\\nSummary..."},{"auditName":"DEAD_CODE","auditFindings":[],"noFindingsJustification":"Inspected backend/src/routes/*.ts and frontend/src/pages/* with rg for unreferenced exports; every match is registered in create-api-app.ts or routes.tsx, so nothing qualified.","reportMarkdown":"# DEAD_CODE Audit Report\\n\\nSummary..."}]}
\`\`\`

Return exactly one \`auditReports[]\` entry for each selected audit name. Each entry's \`auditName\` must exactly match one of the selected audit names. Only include verified findings. Do not include speculative, stale, duplicate, or unverifiable findings. Severity must be one of Critical, High, Medium, or Low.

EVIDENCE CONTRACT — every entry must prove its own audit actually ran:
- If \`auditFindings\` is non-empty, each finding's \`description\` must carry a \`Verified:\` line citing a \`path:line\`, a scoped search and its result, or a measured artifact and its value (\`measured src/lib/archive-lock.ts at 297 lines\`), per the audit workflow verification gate. Size, count, and duration findings have no single line to point at — use the measurement form for those rather than inventing a line number.
- If \`auditFindings\` is empty, the entry MUST include a \`noFindingsJustification\` string of at least one full sentence naming the specific files, globs, or commands you inspected for THIS audit **and what came back** — a named scope with no stated result reads as an assertion, not evidence. Boilerplate such as "no issues", "looks clean", or "code is fine" is not acceptable — cite concrete, audit-specific evidence.
- Any entry returning empty \`auditFindings\` without genuine per-audit justification is rejected and remains pending — no report from it is persisted, so it cannot count as fresh audit evidence. A real finding in a sibling report does not excuse an unjustified empty one. Do the per-audit investigation before reporting zero.
- aidd validates every finding entry's shape. An entry that is not an object, or lacks a title, spec, recognized severity, or at least one affected file, causes that ENTIRE audit's report to be rejected and remain pending for retry. Its \`Verified:\` evidence must be non-empty and cite a \`path:line\`, a scoped grep/search result, or a measured artifact and its value. No findings or report from a rejected entry are persisted.

This is an unattended run. Do not ask interactive questions. If an audit cannot proceed (unreadable workspace, missing audit definition, environment failure), report the blocker in your normal response and do NOT emit AIDD_RESULT — never fabricate findings or an empty report to satisfy the contract.

${measurementContract}`;
		}
		return `## aidd RESULT CONTRACT

After completing the audit, include exactly one final result marker in your assistant response:

\`\`\`text
AIDD_RESULT: {"auditFindings":[{"title":"Brief issue title","description":"Verified: path:line - evidence","spec":"Concrete remediation steps","severity":"High","affectedFiles":["path/to/file.ts"]}],"reportMarkdown":"# AUDIT_NAME Audit Report\\n\\nSummary..."}
\`\`\`

Only include verified findings. Do not include speculative, stale, duplicate, or unverifiable findings. Severity must be one of Critical, High, Medium, or Low. Every \`Verified:\` line must be non-empty and cite a \`path:line\`, a scoped grep/search result, or a measured artifact and its value (\`measured src/lib/archive-lock.ts at 297 lines\` — use this for size, count, and duration findings rather than inventing a line number). If \`auditFindings\` is empty, include a \`noFindingsJustification\` string of at least one full sentence naming the specific files, globs, or commands you inspected and what came back — boilerplate such as "no issues" or "looks clean" is not acceptable. An unjustified empty report is rejected and remains pending; it is not persisted as fresh audit evidence.

aidd validates every finding entry's shape. An entry that is not an object, or lacks a title, spec, \`Verified:\` description, recognized severity, or at least one affected file, causes the whole report to be rejected and the audit re-run — nothing from it is persisted.

This is an unattended run. Do not ask interactive questions. If the audit cannot proceed (unreadable workspace, missing audit definition, environment failure), report the blocker in your normal response and do NOT emit AIDD_RESULT — never fabricate findings or an empty report to satisfy the contract.

${measurementContract}`;
	}
	if (plan.mode === 'interview') {
		return `## aidd RESULT CONTRACT

After writing the interview response file, include exactly one final result marker in your assistant response:

\`\`\`text
AIDD_RESULT: {"responseMarkdown":"# Question N: Title\\n\\n## Question\\n\\n...\\n\\n## Response\\n\\n..."}
\`\`\`

The responseMarkdown value must be the complete Markdown content for the response file.
`;
	}
	if (plan.mode === 'director') {
		return `## aidd RESULT CONTRACT

The director output file you wrote is the single source of truth — aidd reads the suggestions from that file, not from this marker. After writing the file, include exactly one final result marker to signal completion:

\`\`\`text
AIDD_RESULT: {"directorOutputWritten":true}
\`\`\`

Do NOT restate the suggestions or fleet summary in this marker; put the complete output in the file only. Emit the marker exactly once, after the file is written.
`;
	}
	if (plan.mode === 'directive') {
		// A directive run's deliverable is its response (a review/answer) or its committed changes,
		// not a feature marker — so directive mode had no result contract at all. Read-only
		// directives are then structurally unable to signal success: forbidden to commit or write
		// .aidd artifacts, and never told to emit a marker, they land on missing_aidd_result / exit
		// 73 even when the review completed correctly. This lightweight marker is that missing
		// completion signal; aidd only checks it was emitted, so the body is a fixed flag.
		const readonly = plan.customDirectiveReadonly === true;
		const closing = readonly
			? 'This is a read-only directive: the findings or answer in your response ARE the deliverable, so deliver them in full and then emit the marker. Do not commit, write files, or otherwise alter the repository — the marker alone signals completion.'
			: 'Before emitting the marker, document your work in /.aidd/CHANGELOG.md and commit every non-ignored change, per the completion steps above.';
		return `## aidd RESULT CONTRACT

When you have fully carried out the directive, include exactly one final result marker in your assistant response:

\`\`\`text
AIDD_RESULT: {"directiveCompleted":true}
\`\`\`

Emit this marker exactly once, at the very end, and only after the directive is genuinely complete — a delivered review, a delivered answer, or a completed set of changes all count. A clean "nothing to change / already correct / nothing to review" conclusion is itself a complete result: emit the marker. Do NOT emit it for partial work, or when you are blocked and reporting the blocker back for a human decision. ${closing}`;
	}
	return '';
}

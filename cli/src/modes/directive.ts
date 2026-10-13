import type { ModeContext, ModeHandler, ModeResult, SelectedWork } from 'aidd-shared/modes/types';
import type { AgentRunResult } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';

import { writeSkillReport } from 'aidd-shared/metadata/skill-reports';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { relative } from 'node:path';

import { createPlanBackedMode } from './base.ts';

/**
 * Save the report a review-only skill run handed back, and say where it went. The run may not write
 * into the project, so without this its findings exist only in the transcript. The file goes to the
 * canonical project, never to a throwaway worktree that is discarded with the run.
 *
 * The report is the whole deliverable of such a run. One that returned none, or whose report could
 * not be written, has not delivered, whatever the agent said about its own work: `saved` is false
 * and the caller records the run as incomplete, so nothing that schedules or reads these runs can
 * take a missing report for a finished review.
 */
async function saveReviewReport(
	context: ModeContext,
	skillId: string,
	reportMarkdown: unknown,
): Promise<{ note: string; saved: boolean }> {
	if (typeof reportMarkdown !== 'string' || reportMarkdown.trim() === '') {
		return { note: 'the run returned no report, so there is nothing to save', saved: false };
	}
	const projectDir = context.findingLedgerStore?.projectDir ?? context.projectDir;
	const options = context.runId === undefined ? {} : { runId: context.runId };
	try {
		const path = await writeSkillReport(projectDir, skillId, reportMarkdown, options);
		const shown = relative(projectDir, path).replaceAll('\\', '/');
		return { note: `report saved to ${shown}`, saved: true };
	} catch (err) {
		return { note: `the report could not be saved: ${errorText(err)}`, saved: false };
	}
}

/** The result of a completed review-only skill run: complete only once its report is saved. */
async function withSavedReport(
	context: ModeContext,
	skillId: string,
	result: AgentRunResult,
	text: { label: string; summary: string },
): Promise<ModeResult> {
	const report = result.structuredResult?.reportMarkdown;
	const outcome = await saveReviewReport(context, skillId, report);
	return outcome.saved
		? { complete: true, summary: `${text.summary}; ${outcome.note}` }
		: incomplete(text.label, outcome.note);
}

function incomplete(label: string, reason: string): ModeResult {
	return {
		complete: false,
		fatal: { exitCode: orchestratorExitCodes.generalError, stopReason: 'blocked' },
		summary: `${label} incomplete: ${reason}`,
	};
}

function errorText(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/** The result of a run that said its directive was not carried out, or undefined when it did not. */
function blockedResult(label: string, result: AgentRunResult): ModeResult | undefined {
	if (result.structuredResult?.directiveCompleted !== false) return undefined;
	const reason = result.structuredResult.reason;
	return incomplete(label, typeof reason === 'string' ? reason : 'required work remains');
}

function isComplete(result: AgentRunResult): boolean {
	return result.exitCode === 0 && result.structuredResult?.directiveCompleted === true;
}

/** Only a skill run that may not write into the project has its report saved for it. */
function savesReviewReport(plan: RunPlan): boolean {
	return plan.prompt.skillId !== undefined && plan.prompt.customDirectiveReadonly === true;
}

// Directive runs execute their supplied prompt verbatim, whether launched by a pipeline step,
// skill, or operator. They deliberately do not select or claim a backlog feature: the
// agent's directive is the unit of work, and completion requires its explicit result as well as a
// successful backend exit. Returning `generic` work keeps the backend running (unlike
// `none`, which the orchestrator skips) while leaving every feature untouched.
export function createDirectiveMode(plan: RunPlan): ModeHandler {
	const base = createPlanBackedMode(plan);
	// A skill run *is* a directive run, but the operator invoked a named skill and the web Runs
	// table labels it KIND=Skill. Summarizing it as "directive run" contradicts that label, so
	// name the skill whenever one compiled this prompt.
	const skillId = plan.prompt.skillId;
	const label = skillId === undefined ? 'directive run' : `skill '${skillId}' run`;
	return {
		...base,
		async buildPromptPlan() {
			return plan.prompt;
		},
		name: 'directive',
		async processResult(context, result): Promise<ModeResult> {
			const blocked = blockedResult(label, result);
			if (blocked) return blocked;
			const complete = isComplete(result);
			const summary = result.skipped
				? `${label} skipped`
				: `${label} finished with exit code ${result.exitCode}`;
			if (!complete || skillId === undefined || !savesReviewReport(plan)) {
				return { complete, summary };
			}
			return await withSavedReport(context, skillId, result, { label, summary });
		},
		async selectWork(_context: ModeContext): Promise<SelectedWork> {
			return {
				description: label,
				id: 'directive',
				kind: 'generic',
			};
		},
	};
}

import type { AiddMode, PromptPlan, RunPlan } from 'aidd-shared/plan/types';

import { EXT_APP_URL_ENV } from 'aidd-shared/metadata/active-runs';
import { runRepoDir } from 'aidd-shared/plan/types';

import type { CompiledPrompt } from '../../prompts/types.ts';
import type { IterationDetails } from '../details/types.ts';

import { compilePrompt } from '../../prompts/compile.ts';
import { probeAppUrl } from './app-url-probe.ts';
import { baselineVerifiedNote, windDownNote } from './carryover-notes.ts';
import { gitWorktreeClean, readGitHead } from './git.ts';

// Wind-down: when the remaining wall-clock budget is thin, warn the agent up front so it lands
// in-flight work instead of being hard-aborted mid-commit. Skipped on the first iteration — a
// budget smaller than the threshold shouldn't open the run with a warning.
export function armWindDownNoteIfNeeded(
	promptContext: IterationPromptContext,
	plan: RunPlan,
	runStartedAtMs: number,
	iteration: number,
): void {
	if (iteration === 0 || plan.outputPolicy.timeoutSeconds <= 0) return;
	const budgetMs = plan.outputPolicy.timeoutSeconds * 1000;
	const remainingMs = runStartedAtMs + budgetMs - Date.now();
	if (remainingMs <= Math.min(900_000, budgetMs * 0.1)) {
		promptContext.setWindDownNote(windDownNote(remainingMs));
	}
}

// Only the modes whose prompt opens with a pre-implementation quality gate can have that gate
// waived. Director runs in its own data directory, audits are read-only, and interviews never
// touch the toolchain, so a "baseline verified" note would be noise there.
const baselineGateModes: ReadonlySet<AiddMode> = new Set<AiddMode>([
	'coding',
	'todo',
	'triumvirate',
	'validate',
]);

/** Whether an iteration left behind evidence that the project's quality gate actually ran and
 * passed. A clean exit with an accepted completion is not that evidence: the completion is the
 * agent's own claim, and aidd only verifies that something was committed — an agent that commits
 * and emits `AIDD_RESULT` without ever running the gate would otherwise license the *next*
 * iteration to skip its baseline gate too, and the run would never test the tree at all. So the
 * skip is armed only from observed gate commands: the project's QC script passing, or a
 * typecheck+build pair passing where there is no single QC script. Any recorded failure disarms
 * it. Backends that surface no pass/fail verdicts record no final checks and so never arm it. */
export function iterationProvedCleanBaseline(details: IterationDetails): boolean {
	const { build, format, smokeQc, typecheck } = details.summary.finalChecks;
	if ([build, format, smokeQc, typecheck].includes('failed')) return false;
	return smokeQc === 'passed' || (typecheck === 'passed' && build === 'passed');
}

// Baseline skip: the previous iteration exited clean with an accepted completion and recorded a
// passing quality gate (iterationProvedCleanBaseline). If nothing has moved on disk since,
// re-running that gate before this iteration's work only re-proves it. Verified here rather than
// trusted: a dirty tree or an unreadable HEAD arms nothing.
export async function armBaselineNoteIfNeeded(
	promptContext: IterationPromptContext,
	plan: RunPlan,
	previousIterationVerifiedBaseline: boolean,
): Promise<void> {
	if (!previousIterationVerifiedBaseline || !baselineGateModes.has(plan.mode)) return;
	const projectDir = runRepoDir(plan);
	if (!(await gitWorktreeClean(projectDir, { excludeAiddMetadata: true }))) return;
	const head = await readGitHead(projectDir);
	if (head === undefined) return;
	promptContext.setBaselineNote(baselineVerifiedNote(head));
}

// Owns the launch context the orchestrator threads into each iteration's prompt: the live app URL of
// the launcher-managed instance (set by the web backend for dogfood runs, so the agent reuses the
// running panel instead of starting its own server) and three one-shot notes — a carryover nudge
// raised after a flailing iteration, a wind-down warning set when the wall-clock budget is nearly
// exhausted, and a baseline-verified skip for the pre-implementation gate. Each note applies only to
// the next compile, then clears itself. They are separate fields because they are set at different
// points in the loop; sharing a slot would let one silently clobber another.
export class IterationPromptContext {
	private readonly appUrl: string | undefined;
	private baselineNote: string | undefined;
	private carryoverNote: string | undefined;
	private readonly projectDir: string;
	private readonly rootDir: string;
	private windDownNote: string | undefined;

	constructor(projectDir: string, rootDir: string) {
		this.projectDir = projectDir;
		this.rootDir = rootDir;
		this.appUrl = process.env[EXT_APP_URL_ENV];
	}

	setBaselineNote(note: string | undefined): void {
		this.baselineNote = note;
	}

	setCarryoverNote(note: string | undefined): void {
		this.carryoverNote = note;
	}

	setWindDownNote(note: string | undefined): void {
		this.windDownNote = note;
	}

	async compile(promptPlan: PromptPlan): Promise<CompiledPrompt> {
		const notes = [this.carryoverNote, this.windDownNote, this.baselineNote].filter(
			(note): note is string => typeof note === 'string' && note.length > 0,
		);
		this.baselineNote = undefined;
		this.carryoverNote = undefined;
		this.windDownNote = undefined;
		const carryoverNote = notes.length > 0 ? notes.join('\n\n') : undefined;
		// Probed per iteration, not once per run: an app that was up at launch can be gone by
		// iteration 5, and the whole point is that the prompt states the current truth.
		const appUrlStatus = await probeAppUrl(this.appUrl);
		return compilePrompt(promptPlan, {
			projectDir: this.projectDir,
			rootDir: this.rootDir,
			...(this.appUrl ? { appUrl: this.appUrl, appUrlStatus } : {}),
			...(carryoverNote ? { carryoverNote } : {}),
		});
	}
}

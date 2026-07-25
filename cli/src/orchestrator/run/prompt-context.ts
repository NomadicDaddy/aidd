import type { PromptPlan, RunPlan } from 'aidd-shared/plan/types';

import { EXT_APP_URL_ENV } from 'aidd-shared/metadata/active-runs';

import type { CompiledPrompt } from '../../prompts/types.ts';

import { compilePrompt } from '../../prompts/compile.ts';
import { windDownNote } from './carryover-notes.ts';

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

// Owns the launch context the orchestrator threads into each iteration's prompt: the live app URL of
// the launcher-managed instance (set by the web backend for dogfood runs, so the agent reuses the
// running panel instead of starting its own server) and two one-shot notes — a carryover nudge
// raised after a flailing iteration, and a wind-down warning set when the wall-clock budget is
// nearly exhausted. Each note applies only to the next compile, then clears itself. They are
// separate fields because the flailing nudge is set at loop end and the wind-down at loop start;
// sharing a slot would let one silently clobber the other.
export class IterationPromptContext {
	private readonly appUrl: string | undefined;
	private carryoverNote: string | undefined;
	private readonly projectDir: string;
	private readonly rootDir: string;
	private windDownNote: string | undefined;

	constructor(projectDir: string, rootDir: string) {
		this.projectDir = projectDir;
		this.rootDir = rootDir;
		this.appUrl = process.env[EXT_APP_URL_ENV];
	}

	setCarryoverNote(note: string | undefined): void {
		this.carryoverNote = note;
	}

	setWindDownNote(note: string | undefined): void {
		this.windDownNote = note;
	}

	async compile(promptPlan: PromptPlan): Promise<CompiledPrompt> {
		const notes = [this.carryoverNote, this.windDownNote].filter(
			(note): note is string => typeof note === 'string' && note.length > 0,
		);
		this.carryoverNote = undefined;
		this.windDownNote = undefined;
		const carryoverNote = notes.length > 0 ? notes.join('\n\n') : undefined;
		return compilePrompt(promptPlan, {
			projectDir: this.projectDir,
			rootDir: this.rootDir,
			...(this.appUrl ? { appUrl: this.appUrl } : {}),
			...(carryoverNote ? { carryoverNote } : {}),
		});
	}
}

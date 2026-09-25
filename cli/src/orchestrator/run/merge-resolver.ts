import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';

import { monitorBackend } from 'aidd-shared/backends/monitor';
import { exitCodeFromEvents, orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import { gitOutput, gitSuccess } from './git-exec.ts';

export interface MergeResolverOptions {
	backend: CLIBackend;
	reasoningEffort: string;
	simulation: boolean;
}

/** A callback that attempts to resolve an in-progress merge conflict, returning true only if the
 * merge was fully resolved and committed. */
export type MergeConflictResolver = (projectDir: string, branch: string) => Promise<boolean>;

async function conflictedPaths(projectDir: string): Promise<string[]> {
	const out = await gitOutput(projectDir, ['diff', '--name-only', '--diff-filter=U']);
	return out
		? out
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter(Boolean)
		: [];
}

// MERGE_HEAD exists exactly while a merge is in progress; its absence means the merge was either
// committed or aborted. Combined with "no unmerged paths", a missing MERGE_HEAD proves completion.
async function mergeInProgress(projectDir: string): Promise<boolean> {
	return gitSuccess(projectDir, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
}

function buildMergeResolvePrompt(branch: string, paths: string[]): string {
	return `## aidd MERGE CONFLICT RESOLUTION

A merge of run branch \`${branch}\` into the project branch is IN PROGRESS and has conflicts.
Resolve every conflict, then complete the merge — do nothing else.

Conflicted files:
${paths.map((p) => `- ${p}`).join('\n')}

Rules:
- Edit only the conflicted files above. Resolve each conflict by combining both sides' intent;
  remove every conflict marker (<<<<<<<, =======, >>>>>>>).
- Do NOT change unrelated files, run formatters, or alter project behavior beyond resolving.
- When done, stage the resolved files and commit the merge:
  \`git add <files>\` then \`git commit --no-edit\`.
- If you cannot safely resolve the conflicts, stop without committing — the run will be parked
  for manual resolution.`;
}

/** Build a resolver that runs the backend agent against the conflicted, mid-merge tree it is
 * given — the scratch merge worktree `mergeRunBack` creates, never the operator's checkout.
 * Conservative: it returns true only after verifying the merge actually completed (MERGE_HEAD
 * gone and no unmerged paths remain), so a wandering or failed agent falls back to parking. */
export function createMergeResolver(options: MergeResolverOptions): MergeConflictResolver {
	return async (projectDir, branch) => {
		const paths = await conflictedPaths(projectDir);
		if (paths.length === 0) return false;
		const input: PromptInput = {
			cwd: projectDir,
			reasoningEffort: options.reasoningEffort,
			simulation: options.simulation,
			text: buildMergeResolvePrompt(branch, paths),
		};
		const controller = new AbortController();
		const events: AgentEvent[] = [];
		try {
			for await (const event of monitorBackend(options.backend, input, controller.signal)) {
				if (event.type !== 'assistant_delta') events.push(event);
			}
		} catch {
			return false;
		}
		if (exitCodeFromEvents(events) !== orchestratorExitCodes.success) return false;
		// Verify ground truth: the agent must have committed the merge, leaving no conflict state.
		if (await mergeInProgress(projectDir)) return false;
		return (await conflictedPaths(projectDir)).length === 0;
	};
}

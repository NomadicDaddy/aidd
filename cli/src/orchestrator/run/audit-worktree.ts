import type { RunPlan, WorktreePlan } from 'aidd-shared/plan/types';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { existsSync } from 'node:fs';

import type { WorktreeFinalization } from './worktree-evidence.ts';

import { gitOutput } from './git-exec.ts';
import { persistRunEvidence } from './worktree-evidence.ts';
import { removeRunWorktree } from './worktree-manager.ts';

export function liveAuditWarnings(plan: RunPlan): string[] {
	if (plan.mode !== 'audit' || !plan.audit?.liveTree) return [];
	return [
		'[audit-live-tree] worktree isolation explicitly disabled; agent ran against the live checkout',
	];
}

export function auditIntegritySummary(
	summary: string,
	exitCode: number,
	{ error, paths }: NonNullable<WorktreeFinalization['auditIntegrity']>,
): string {
	const detail = [
		error,
		paths.length > 0 ? `tracked files changed: ${paths.join(', ')}` : undefined,
	]
		.filter(Boolean)
		.join('; ');
	return `${summary}; [audit-integrity-violation] ${detail}; source was not merged (exit ${exitCode}).`;
}

function auditFinalization(
	evidenceFiles: number,
	paths: string[],
	error?: string,
): WorktreeFinalization {
	return {
		...(paths.length > 0 || error !== undefined
			? {
					auditIntegrity: { ...(error ? { error } : {}), paths },
					overrideExitCode: orchestratorExitCodes.writeAllowlistViolation,
				}
			: {}),
		evidenceFiles,
		mergeStatus: 'discarded',
	};
}

async function trackedAuditPaths(worktree: WorktreePlan): Promise<string[] | undefined> {
	const diff = await gitOutput(worktree.dir, [
		'diff',
		'--name-only',
		'--no-renames',
		'-z',
		worktree.baseSha,
		'--',
	]);
	return diff === undefined ? undefined : [...new Set(diff.split('\0').filter(Boolean))].sort();
}

/** Audit findings are persisted canonically by the runtime. Never merge the agent's checkout
 * or copy its metadata delta back. Inspect tracked content against the starting pin, preserve
 * evidence before cleanup, and fail closed if inspection or evidence preservation fails. */
export async function finalizeAuditWorktree(
	projectDir: string,
	worktree: WorktreePlan,
): Promise<WorktreeFinalization> {
	let evidenceFiles: number;
	try {
		evidenceFiles = await persistRunEvidence(projectDir, worktree.dir);
	} catch {
		return {
			...auditFinalization(
				0,
				[],
				`could not preserve audit evidence; checkout retained at ${worktree.dir}`,
			),
			evidencePersistFailed: true,
		};
	}
	const paths = await trackedAuditPaths(worktree);
	if (paths === undefined) {
		return auditFinalization(
			evidenceFiles,
			[],
			`tracked-file diff unavailable; checkout retained at ${worktree.dir}`,
		);
	}
	await removeRunWorktree(projectDir, worktree);
	const cleanupError = existsSync(worktree.dir)
		? `audit checkout removal failed; retained at ${worktree.dir}`
		: undefined;
	return auditFinalization(evidenceFiles, paths, cleanupError);
}

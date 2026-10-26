import type { RunPlan, WorktreePlan } from 'aidd-shared/plan/types';

import { scrubSecrets } from 'aidd-shared/lib/secretScrubber';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { createAuditInstallConfig } from './audit-dependencies-config.ts';
import {
	type AuditInstallResult,
	type AuditSetupEvidence,
	createAuditSetupEvidence,
	writeAuditSetupEvidence,
} from './audit-dependencies-evidence.ts';
import {
	assertAuditGitUnchanged,
	readSetupGit,
	snapshotAuditGit,
} from './audit-dependencies-git.ts';
import { needsAuditDependencyInstall } from './audit-dependencies-policy.ts';
import { runAuditDependencyInstall } from './audit-dependencies-process.ts';

function assertSetupSourceUnchanged(worktree: WorktreePlan, deadlineAtMs: number): void {
	const paths = readSetupGit(
		worktree.dir,
		['diff', '--name-only', '--no-renames', '-z', worktree.baseSha, '--'],
		deadlineAtMs,
	)
		.split('\0')
		.filter(Boolean);
	if (paths.length > 0) {
		throw new Error(
			`[audit-integrity-violation] Dependency setup changed tracked files: ${paths.join(', ')}`,
		);
	}
}

function setSetupDeadline(plan: RunPlan, evidence: AuditSetupEvidence): number {
	const budgetMs = plan.outputPolicy.timeoutSeconds * 1000;
	if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
		throw new Error('Audit dependency setup needs a positive configured run timeout.');
	}
	evidence.runStartedAtMs = plan.runStartedAtMs ??= Date.now();
	evidence.deadlineAtMs = evidence.runStartedAtMs + budgetMs;
	return evidence.deadlineAtMs;
}

function setupInterruption(
	plan: RunPlan,
	evidence: AuditSetupEvidence,
): AuditInstallResult | undefined {
	needsAuditDependencyInstall(evidence.cwd);
	const deadlineAtMs = setSetupDeadline(plan, evidence);
	if (Date.now() >= deadlineAtMs) {
		return { cleanupComplete: true, exitCode: null, status: 'timeout' };
	}
	const stopFiles = [plan.stopPolicy.stopFile, plan.stopPolicy.projectStopFile];
	if (stopFiles.some((file) => existsSync(file))) {
		return { cleanupComplete: true, exitCode: null, status: 'stopped' };
	}
	return undefined;
}

function withinSetupDeadline(
	evidence: AuditSetupEvidence,
	result: AuditInstallResult,
): AuditInstallResult {
	return Date.now() >= evidence.deadlineAtMs! ? { ...result, status: 'timeout' } : result;
}

async function executeAuditSetup(
	plan: RunPlan,
	evidence: AuditSetupEvidence,
): Promise<{ configPath?: string; result: AuditInstallResult }> {
	const interrupted = setupInterruption(plan, evidence);
	if (interrupted) return { result: interrupted };
	evidence.gitBefore = snapshotAuditGit(evidence.cwd, evidence.deadlineAtMs!);
	const config = await createAuditInstallConfig(evidence);
	await writeAuditSetupEvidence(evidence);
	// Keep the checkout on any exception until the runner has explicitly confirmed cleanup.
	plan.worktree!.setupCleanupIncomplete = true;
	const stopFiles = [plan.stopPolicy.stopFile, plan.stopPolicy.projectStopFile];
	const result = await runAuditDependencyInstall(evidence, evidence.deadlineAtMs!, stopFiles);
	if (result.cleanupComplete) {
		delete plan.worktree!.setupCleanupIncomplete;
	}
	return { configPath: config, result };
}

async function inspectFinishedSetup(
	plan: RunPlan,
	evidence: AuditSetupEvidence,
	configPath: string | undefined,
): Promise<void> {
	if (configPath === undefined) return;
	await unlink(configPath);
	if (Date.now() >= evidence.deadlineAtMs!) return;
	evidence.gitAfter = snapshotAuditGit(evidence.cwd, evidence.deadlineAtMs!);
	assertAuditGitUnchanged(evidence.gitBefore!, evidence.gitAfter);
	assertSetupSourceUnchanged(plan.worktree!, evidence.deadlineAtMs!);
}

function setupFailure(result: AuditInstallResult, evidence: AuditSetupEvidence): string {
	const cleanup = result.cleanupComplete ? '' : '; child cleanup incomplete, checkout retained';
	return `Audit dependency setup ${result.status} (exit ${String(result.exitCode)})${cleanup}; evidence: ${evidence.recordPath}`;
}

function assertInstallSucceeded(result: AuditInstallResult, evidence: AuditSetupEvidence): void {
	if (result.status !== 'complete' || result.exitCode !== 0 || !result.cleanupComplete) {
		throw new Error(setupFailure(result, evidence));
	}
}

async function recordSetupFailure(
	plan: RunPlan,
	evidence: AuditSetupEvidence,
	result: AuditInstallResult | undefined,
	error: unknown,
): Promise<never> {
	const message = scrubSecrets(error instanceof Error ? error.message : String(error));
	const failed = result ?? {
		cleanupComplete: !plan.worktree?.setupCleanupIncomplete,
		exitCode: null,
		status: 'failed' as const,
	};
	await writeAuditSetupEvidence(evidence, {
		...failed,
		error: message,
		status: failed.status === 'complete' ? 'failed' : failed.status,
	});
	throw new Error(message);
}

/** One frozen, copied dependency tree per isolated audit run, before provider execution. */
export async function prepareAuditDependencies(plan: RunPlan, runId: string): Promise<void> {
	if (plan.mode !== 'audit' || !plan.worktree) return;
	if (!existsSync(join(plan.worktree.dir, 'package.json'))) return;
	const evidence = await createAuditSetupEvidence(plan.projectDir, runId, plan.worktree.dir);
	await writeAuditSetupEvidence(evidence);
	console.log(
		`[audit-setup] frozen dependency install in ${evidence.cwd}; evidence: ${evidence.recordPath}`,
	);
	let result: AuditInstallResult | undefined;
	try {
		const execution = await executeAuditSetup(plan, evidence);
		result = withinSetupDeadline(evidence, execution.result);
		if (result.cleanupComplete)
			await inspectFinishedSetup(plan, evidence, execution.configPath);
		result = withinSetupDeadline(evidence, result);
		assertInstallSucceeded(result, evidence);
		await writeAuditSetupEvidence(evidence, result);
	} catch (err) {
		await recordSetupFailure(plan, evidence, result, err);
	}
}

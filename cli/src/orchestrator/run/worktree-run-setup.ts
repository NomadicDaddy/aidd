// CLI-entrypoint wiring for worktree-isolated runs: create the throwaway checkout, seed its
// gitignored `.aidd` from the canonical store, build the orchestrator deps that route
// finalization and the run ledger, and roll back (evidence-first) on a thrown failure.
// Extracted from app.ts so the entrypoint stays a thin sequence of phases.

import type { AiddStore } from 'aidd-shared/metadata/store';
import type { RunPlan } from 'aidd-shared/plan/types';

import { join } from 'node:path';

import type { MergeConflictResolver } from './merge-resolver.ts';
import type { OrchestratorDeps } from './types.ts';
import type { WorktreeMetadataSession } from './worktree-metadata-session.ts';

import { auditIntegritySummary, finalizeAuditWorktree } from './audit-worktree.ts';
import { finalizeRunWorktree, persistRunEvidence } from './worktree-evidence.ts';
import { createRunWorktree, removeRunWorktree } from './worktree-manager.ts';
import { seedWorktreeMetadata } from './worktree-metadata-session.ts';

export interface WorktreeRunContext {
	session: WorktreeMetadataSession;
}

function warnForLiveAudit(plan: RunPlan): boolean {
	if (plan.mode !== 'audit' || !plan.audit?.liveTree) return false;
	console.warn(
		'[audit-live-tree] Worktree isolation explicitly disabled; the audit agent can write the live checkout.',
	);
	return true;
}

function needsWorktree(plan: RunPlan, requested: boolean): boolean {
	return plan.mode === 'audit' || (requested && plan.mode === 'coding');
}

function handleMissingHead(plan: RunPlan, launcherManaged: boolean): null {
	if (plan.mode === 'audit') {
		throw new Error(
			'Audit isolation requires a committed Git HEAD; refusing to run against the live tree. Use --audit-live-tree only to explicitly accept that exposure.',
		);
	}
	if (launcherManaged) {
		throw new Error(
			'--worktree was requested by the launcher, which counted this run as isolated, but the project no longer has a committed HEAD of its own; refusing to run against the live tree.',
		);
	}
	console.warn(
		'[worktree] --worktree requested but the project has no committed HEAD; running against the live tree.',
	);
	return null;
}

/** Set up coding isolation when requested, or audit isolation by default. On success `worktree`
 * is populated (so `runRepoDir(plan)` resolves to the checkout) and the seeded metadata session
 * is returned. Non-coding/non-audit modes skip it. Coding can fall back with a warning when
 * there is no committed HEAD; audits fail closed unless --audit-live-tree was explicitly set.
 * A launcher-managed run never falls back: the launcher queued it with --worktree only after
 * finding a HEAD, and admission counted it as isolated from that flag, so a HEAD gone by the time
 * the child starts must fail the run rather than put a second mutating run in the live tree.
 *
 * Seeding matters: `.aidd/` is gitignored in every supported profile, so the fresh checkout
 * contains NO project metadata. An unseeded worktree store lists zero features and the run ends
 * `no_work` (silent success) regardless of eligible work. Seeding failures throw to the caller,
 * whose rollback path preserves evidence and removes the worktree. */
export async function prepareWorktreeRun(input: {
	/** Launched by the web panel or another launcher that counted this run as isolated. */
	launcherManaged: boolean;
	plan: RunPlan;
	requested: boolean;
	runId: string;
	webDataDir?: string;
}): Promise<null | WorktreeRunContext> {
	const { launcherManaged, plan, requested, runId, webDataDir } = input;
	if (warnForLiveAudit(plan) || !needsWorktree(plan, requested)) return null;
	const worktree = await createRunWorktree(plan.projectDir, runId, {
		...(webDataDir ? { baseDir: join(webDataDir, 'worktrees') } : {}),
	});
	if (worktree === null) return handleMissingHead(plan, launcherManaged);
	plan.worktree = worktree;
	console.log(`[worktree] run isolated in ${worktree.dir} on branch ${worktree.branch}`);
	const session = await seedWorktreeMetadata(plan.projectDir, worktree.dir);
	console.log(
		`[worktree] seeded ${session.seededFiles} metadata file(s) into the worktree store`,
	);
	return { session };
}

/** Orchestrator deps for a worktree run: coding merge-back/park and metadata write-back, or
 * audit discard-only cleanup, run INSIDE the terminal writeRunSummary via this hook —
 * before the ledger append and the run's heartbeat — so a parked merge surfaces as a
 * non-success exit code everywhere instead of the pre-merge success. The ledger goes to the
 * canonical store. Audit iteration evidence is already canonical; coding evidence is copied
 * before its worktree's gitignored `.aidd` is removed. */
export function worktreeOrchestratorDeps(
	plan: RunPlan,
	context: WorktreeRunContext,
	canonicalStore: AiddStore,
	resolveConflict: MergeConflictResolver,
): Pick<OrchestratorDeps, 'finalizeWorktree' | 'ledgerStore'> {
	const worktree = plan.worktree;
	if (!worktree) throw new Error('worktreeOrchestratorDeps requires plan.worktree');
	return {
		finalizeWorktree: (exitCode: number) =>
			plan.mode === 'audit'
				? finalizeAuditWorktree(plan.projectDir, worktree)
				: finalizeRunWorktree({
						exitCode,
						projectDir: plan.projectDir,
						resolveConflict,
						session: context.session,
						worktree,
					}),
		ledgerStore: canonicalStore,
	};
}

/** Rollback for a thrown run failure that never reached merge-back: preserve coding iteration
 * evidence, or keep audit evidence already written canonically, then discard the worktree instead
 * of leaking a branch + checkout. Best-effort on both steps.
 *
 * Covers THROWN errors only. A hard process death (unhandled rejection / uncaught exception)
 * never reaches this path: its evidence is lost with the checkout (accepted — the crash
 * finalizer still writes a canonical failed ledger line) and the web orphan sweeper reaps the
 * leftover worktree. See the crash-finalizer comment in app.ts. */
export async function rollbackWorktreeRun(plan: RunPlan): Promise<void> {
	const worktree = plan.worktree;
	if (!worktree) return;
	if (plan.mode === 'audit') {
		const result = await finalizeAuditWorktree(plan.projectDir, worktree);
		if (result.auditIntegrity) {
			console.warn(
				auditIntegritySummary(
					'Audit rollback',
					result.overrideExitCode!,
					result.auditIntegrity,
				),
			);
		}
		return;
	}
	try {
		await persistRunEvidence(plan.projectDir, worktree.dir);
	} catch (err) {
		// The worktree holds the only copy of the run's logs: when persisting them fails,
		// preserve the checkout instead of discarding it.
		console.warn(
			`[worktree] evidence persistence FAILED during rollback (${err instanceof Error ? err.message : String(err)}); ` +
				`preserving worktree ${worktree.dir} — recover its .aidd/iterations manually.`,
		);
		return;
	}
	await removeRunWorktree(plan.projectDir, worktree).catch(() => {});
}

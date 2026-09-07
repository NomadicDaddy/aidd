import type { StopReason } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';

import { metadataPath } from 'aidd-shared/metadata/paths';
import { runRepoDir } from 'aidd-shared/plan/types';
import { fileChangePathLimit } from 'aidd-shared/runs/file-changes';
import {
	destroyedLeasedFeatureMarker,
	unattributedSourceMarker,
	uncommittedSourceMarker,
} from 'aidd-shared/runs/outcome';

import { cleanIterationLogs } from '../../metadata/log-cleaner.ts';
import { classifyResidualDirtySourcePaths } from './dirty-source-attribution.ts';
import {
	filterRunAttributedCommits,
	gitCommitsDiffStat,
	gitDirtySourcePaths,
	gitUntrackedFeatureDirectories,
	gitWorktreeClean,
} from './git.ts';
import { reconcileRunMetadata } from './metadata-reconcile.ts';
import { type OrchestratorDeps, type RunAccumulator, runRuntimeFields } from './types.ts';

// Iteration-level artifact writers live in ./iteration-artifacts.ts; this module owns the
// run-level summary (ledger line + terminal observer payload). Re-exported so existing
// importers of the artifact surface keep one entry point.
export { buildIterationStructured, writeStartedIterationArtifact } from './iteration-artifacts.ts';

export async function writeRunSummary(
	deps: OrchestratorDeps,
	plan: RunPlan,
	acc: RunAccumulator,
	stopReason: StopReason,
	finalExitCode: number,
	finalSummary: string,
): Promise<number> {
	const endedAtMs = Date.now();
	// Metadata reconciliation goes first so everything below — dirty-source accounting, the AI
	// summary, the worktree merge — observes the reconciled `.aidd`, and so a worktree run's
	// propagated records ride back to the canonical store with the rest of its evidence.
	const reconcileNote = await reconcileRunMetadata(deps, acc, plan);
	// Run-end dirty-source accounting first excludes paths dirty at run start, then attributes
	// new residue only when the run recorded the path in a file-change event or shell command.
	// Concurrent operator edits remain observable without being claimed by or downgrading the run.
	let residualDirtySourceFiles: string[] = [];
	let unattributedDirtySourceFiles: string[] = [];
	const dirtyBaseline = acc.dirtySourcePathsAtStart;
	if (dirtyBaseline !== undefined) {
		const dirtyNow = await gitDirtySourcePaths(runRepoDir(plan));
		const classification = classifyResidualDirtySourcePaths({
			commandsRun: acc.commandsRun,
			dirtyNow: dirtyNow ?? [],
			dirtySourcePathsAtStart: dirtyBaseline,
			projectDir: runRepoDir(plan),
			runRecordedPaths: new Set([...acc.filesCreated, ...acc.filesEdited]),
		});
		residualDirtySourceFiles = classification.attributed;
		unattributedDirtySourceFiles = classification.unattributed;
	}
	const runEndSummaryParts = [finalSummary];
	if (reconcileNote !== null) runEndSummaryParts.push(reconcileNote);
	if (residualDirtySourceFiles.length > 0) {
		runEndSummaryParts.push(
			`${uncommittedSourceMarker} this run left ${residualDirtySourceFiles.length} source file(s) uncommitted at run end`,
		);
	}
	if (unattributedDirtySourceFiles.length > 0) {
		runEndSummaryParts.push(
			`${unattributedSourceMarker} ${unattributedDirtySourceFiles.length} source file(s) changed in the worktree during this run but were not attributable to it`,
		);
	}
	// Every terminal path funnels through here, which is the point: the offending run is usually a
	// single-iteration directive whose carryover note is never drained, so the summary is the only
	// channel that reaches the operator and the ledger.
	if (acc.destroyedLeasedFeatures.length > 0) {
		const destroyed = acc.destroyedLeasedFeatures
			.map((lease) => `${lease.featureId} (held by ${lease.runId})`)
			.join(', ');
		runEndSummaryParts.push(
			`${destroyedLeasedFeatureMarker} this run deleted ${acc.destroyedLeasedFeatures.length} feature record(s) claimed by another live run: ${destroyed}`,
		);
		console.error(
			`[feature-lease] this run deleted ${acc.destroyedLeasedFeatures.length} feature record(s) another live run was working on: ${destroyed} — restore them from git history.`,
		);
	}
	const summaryWithRunEndChecks = runEndSummaryParts.join('; ');
	if (residualDirtySourceFiles.length > 0) {
		console.warn(
			`[orchestrator] this run left ${residualDirtySourceFiles.length} source file(s) uncommitted at run end: ${residualDirtySourceFiles.join(', ')} — review and commit or discard them.`,
		);
	}
	if (unattributedDirtySourceFiles.length > 0) {
		console.warn(
			`[orchestrator] ${unattributedDirtySourceFiles.length} source file(s) changed in the worktree during this run but were not attributable to it: ${unattributedDirtySourceFiles.join(', ')}.`,
		);
	}
	// Generate the AI summary once before appending to the ledger, so a single
	// Direct AI call feeds both the runs.jsonl entry and the terminal heartbeat
	// record via observer.onFinalSummary. The iteration-count guard below ensures
	// zero-iteration runs (preflight blocked, no-work, dirty-tree, encoding guard)
	// never invoke the summarizer even though they do reach this function.
	let aiSummary: null | string = null;
	if (deps.aiSummarizer && acc.runTotals.iterations > 0) {
		try {
			aiSummary = await deps.aiSummarizer({
				acc,
				exitCode: finalExitCode,
				plan,
				stopReason,
				summary: summaryWithRunEndChecks,
			});
		} catch {
			// Fail-soft: any error from the summarizer (including config errors
			// and provider failures) resolves to null without affecting the run.
			aiSummary = null;
		}
	}
	const attributedFeatures = new Set<string>([...acc.selectedFeatures, ...acc.completedFeatures]);
	const attributedCommits = await filterRunAttributedCommits(
		runRepoDir(plan),
		acc.commitsCreated,
		attributedFeatures,
		acc.forcedAttributionCommits,
	);
	const residualUntrackedFeatureDirs = await gitUntrackedFeatureDirectories(runRepoDir(plan));
	const artifactWarnings = [
		...(residualUntrackedFeatureDirs.length > 0 ? ['untracked_feature_directories'] : []),
		...(residualDirtySourceFiles.length > 0 ? ['residual_dirty_source_files'] : []),
		...(unattributedDirtySourceFiles.length > 0 ? ['unattributed_dirty_source_files'] : []),
	];
	// Line-level ground truth for what the run changed, persisted so the web layer can chart
	// output over time without re-walking git. Null (not zeros) when there are no attributed
	// commits or git fails, so downstream consumers can tell "no commits" from "tiny change".
	const diffStat =
		attributedCommits.length > 0
			? await gitCommitsDiffStat(
					runRepoDir(plan),
					attributedCommits.map((commit) => commit.hash),
				).catch(() => null)
			: null;
	const filesCreated = [...acc.filesCreated].slice(0, fileChangePathLimit);
	const filesEdited = [...acc.filesEdited].slice(0, fileChangePathLimit);
	const fileChangePathsTruncated =
		acc.filesCreated.size > fileChangePathLimit || acc.filesEdited.size > fileChangePathLimit;
	// runLedgerDirty flags REAL project
	// dirt only. The harness's own .aidd artifacts (iterations, CHANGELOG, audit reports) are
	// written on every run and never committed, so counting them made this true on 100% of runs
	// and turned the web's amber "Success · warnings" badge into noise.
	const runLedgerDirty = !(await gitWorktreeClean(runRepoDir(plan), {
		excludeAiddMetadata: true,
	}));
	// Worktree finalization happens HERE — after the run-end git accounting above (which must
	// read the worktree before it can be removed) and BEFORE the ledger append + terminal
	// heartbeat below — so BOTH record the run's effective outcome (e.g. a parked merge), never
	// the pre-merge success. The hook also persists the worktree's iteration evidence into the
	// canonical `.aidd` for every outcome, so the ledger's canonical home always has the run's
	// evidence beside it.
	let effectiveExitCode = finalExitCode;
	let effectiveStopReason: StopReason = stopReason;
	let effectiveSummary = summaryWithRunEndChecks;
	if (deps.finalizeWorktree) {
		const finalization = await deps.finalizeWorktree(finalExitCode);
		if (finalization.overrideExitCode !== undefined) {
			effectiveExitCode = finalization.overrideExitCode;
			if (finalization.metadataConflict !== undefined) {
				// A `.aidd` metadata conflict parked the run (not a git merge conflict): a
				// dedicated stop reason keeps the two machine-distinguishable, and the summary
				// surfaces the conflicting paths so the operator knows which metadata diverged.
				const paths = finalization.metadataConflict.join(', ');
				effectiveStopReason = 'metadata_conflict_parked';
				effectiveSummary = `${summaryWithRunEndChecks}; worktree metadata conflict — concurrent canonical change to: ${paths} (exit ${finalization.overrideExitCode}).`;
			} else {
				effectiveStopReason = 'merge_conflict_parked';
				effectiveSummary = `${summaryWithRunEndChecks}; worktree merge parked — resolve the run branch manually (exit ${finalization.overrideExitCode}).`;
			}
		}
	}
	// The ledger line goes to the CANONICAL store: for worktree runs `deps.store` is rooted in
	// the (by now possibly removed) throwaway checkout, whose gitignored `.aidd` never survives
	// the run. Exactly one canonical entry per run, carrying the effective outcome.
	await (deps.ledgerStore ?? deps.store).appendRunSummary({
		...(deps.aiddProvenance ?? {
			aiddDirty: null,
			aiddRevision: null,
			aiddVersion: null,
		}),
		aiSummary,
		durationMs: endedAtMs - acc.runStartedAtMs,
		endedAt: new Date(endedAtMs).toISOString(),
		runId: acc.runId,
		startedAt: acc.runStartedAt,
		...runRuntimeFields(plan),
		...(plan.mode === 'audit' ? { auditFindings: acc.auditFindings } : {}),
		backendExitCode: acc.lastBackendExitCode ?? null,
		commitsCreated: attributedCommits,
		completedFeatures: [...acc.completedFeatures],
		diffStat,
		exitCode: effectiveExitCode,
		fileChangePathsTruncated,
		filesCreated,
		filesEdited,
		runLedgerDirty,
		scopeOverrun: acc.scopeOverrun,
		selectedFeatures: [...acc.selectedFeatures],
		source: deps.source ?? 'cli',
		stopReason: effectiveStopReason,
		summary: effectiveSummary,
		...(artifactWarnings.length > 0 ? { artifactWarnings } : {}),
		...(residualUntrackedFeatureDirs.length > 0 ? { residualUntrackedFeatureDirs } : {}),
		...(residualDirtySourceFiles.length > 0 ? { residualDirtySourceFiles } : {}),
		...(unattributedDirtySourceFiles.length > 0 ? { unattributedDirtySourceFiles } : {}),
		toolBreakdown: acc.toolBreakdownTotals,
		totals: acc.runTotals,
	});
	// aidd deliberately does not commit .aidd/runs.jsonl. The ledger holds unreviewed run metadata
	// (AI-written summaries, commit subjects, file paths, cost totals) and is ignored in every
	// profile, so there is nothing to commit. The follow-up ledger-commit flow was removed.
	// Cleaning targets the canonical iterations dir — for worktree runs the evidence now lives
	// there, and the worktree's own copy is gone with the worktree.
	if (!plan.outputPolicy.noClean) {
		await cleanIterationLogs(metadataPath(plan.projectDir, 'iterations')).catch(() => {});
	}
	// Release the run's cross-run feature leases last: every terminal outcome (completion,
	// failure, no-work, parked merge — finalizeWorktree already ran above) funnels through this
	// function, so leases are dropped exactly when the run stops being live. A hard process
	// death never reaches here; the web orphan reap deletes those leases by dead run id.
	await deps.featureLeases?.releaseAll();
	await deps.observer?.onFinalSummary?.({
		aiSummary,
		backendExitCode: acc.lastBackendExitCode ?? null,
		commitsCreated: attributedCommits,
		completedFeatures: [...acc.completedFeatures],
		diffStat,
		driverId: plan.driver?.driverId ?? null,
		driverKind: plan.driver?.driverKind ?? null,
		driverSha256: plan.driver?.driverSha256 ?? null,
		exitCode: effectiveExitCode,
		fileChangePathsTruncated,
		filesCreated,
		filesEdited,
		runId: acc.runId,
		runLedgerDirty,
		scopeOverrun: acc.scopeOverrun,
		selectedFeatures: [...acc.selectedFeatures],
		stopReason: effectiveStopReason,
		summary: effectiveSummary,
		totals: { ...acc.runTotals },
	});
	return effectiveExitCode;
}

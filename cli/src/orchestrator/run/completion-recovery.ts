import type { AiddStore } from 'aidd-shared/metadata/store';
import type { SelectedWork } from 'aidd-shared/modes/types';

import { isAbsolute, join, relative } from 'node:path';

import type { FeatureScopeAudit, GitCommitSummary } from './types.ts';

import { gitSuccess, readGitHead } from './git-exec.ts';
import { gitDirtySourcePaths, isAiddMetadataPath } from './git.ts';

// A full smoke:qc (build + tests) on a large project runs for several minutes; the ceiling only
// exists so a hung gate cannot wedge run teardown forever.
const defaultGateTimeoutMs = 15 * 60_000;

export interface CompletionRecoveryOutcome {
	commit: GitCommitSummary;
	gateCommand: string;
}

export interface CompletionRecoveryInput {
	dirtySourcePathsAtStart: ReadonlySet<string> | undefined;
	featureScope: FeatureScopeAudit;
	gateTimeoutMs?: number;
	projectDir: string;
	/** Paths the run's own tool events recorded as created or edited (as recorded — absolute or
	 * relative). The attribution source of truth: dirty paths outside this set are not provably
	 * the run's work and disqualify recovery. */
	runRecordedPaths: ReadonlySet<string>;
	store: AiddStore;
	work: SelectedWork;
}

/**
 * Last-chance recovery for a run whose backend died between finishing the work and committing it
 * (observed: claude-code exited mid-`smoke:qc` twice in one run, stranding 16 finished files as
 * `completion_marker_missing_or_unaccepted`). When the selected feature's on-disk state already
 * says completed+passes and the project's own quality gate passes right now, the work is done by
 * the run's own standards — auto-commit it and let the run record a completion instead of
 * failing.
 *
 * Ownership attribution honors the run-end dirty-tree contract (writeRunSummary: never commit
 * work aidd cannot attribute): a path qualifies only when it was NOT dirty at run start AND the
 * run's own tool events recorded writing it. Operator edits made mid-run match neither and
 * disqualify recovery outright — as does any surviving pre-run dirt, an unknown baseline, or a
 * missing gate script. Only the attributed paths (plus dirty tracked .aidd metadata, which aidd
 * owns by contract) are staged — never a blanket `git add -A`. Every error degrades to the
 * existing failure path.
 */
export async function attemptCompletionMarkerRecovery(
	input: CompletionRecoveryInput
): Promise<CompletionRecoveryOutcome | undefined> {
	if (input.work.kind !== 'feature') return undefined;
	if (!input.featureScope.unacceptedCompletedFeatures.includes(input.work.id)) return undefined;
	const feature = await input.store.readFeature(input.work.id).catch(() => undefined);
	if (feature === undefined || feature.status !== 'completed' || feature.passes !== true) {
		return undefined;
	}
	const stagePaths = await attributableDirtyPaths(input);
	if (stagePaths === undefined || stagePaths.length === 0) return undefined;
	const gate = await resolveRecoveryGate(input.projectDir);
	if (gate === undefined) return undefined;
	console.log(
		`[orchestrator] completion recovery: feature ${input.work.id} is completed on disk with uncommitted work; re-running the blocking gate (${gate.display}) before auto-committing.`
	);
	const gatePassed = await runRecoveryGate(
		input.projectDir,
		gate.args,
		input.gateTimeoutMs ?? defaultGateTimeoutMs
	);
	if (!gatePassed) {
		console.log(`[orchestrator] completion recovery abandoned: ${gate.display} did not pass.`);
		return undefined;
	}
	const commit = await commitRecoveredWork(
		input.projectDir,
		input.work.id,
		feature.title,
		gate,
		stagePaths
	);
	if (commit === undefined) return undefined;
	console.log(
		`[orchestrator] completion recovery committed ${commit.hash.slice(0, 10)}: ${commit.subject}`
	);
	return { commit, gateCommand: gate.display };
}

/** The exact paths a recovery commit may stage, or undefined when the tree cannot be fully
 * attributed to the run. Non-.aidd paths must be absent from the run-start baseline AND present
 * in the run's recorded file changes; dirty .aidd metadata rides along (aidd-owned). */
async function attributableDirtyPaths(
	input: CompletionRecoveryInput
): Promise<string[] | undefined> {
	const dirtyPaths = await gitDirtySourcePaths(input.projectDir, { includeAiddMetadata: true });
	if (dirtyPaths === undefined) return undefined;
	const sourcePaths = dirtyPaths.filter((path) => !isAiddMetadataPath(path));
	if (sourcePaths.length === 0) return undefined;
	const baseline = input.dirtySourcePathsAtStart;
	if (baseline === undefined) return undefined;
	const recorded = new Set<string>();
	for (const path of input.runRecordedPaths) {
		const normalized = normalizeRepoPath(input.projectDir, path);
		if (normalized !== undefined) recorded.add(normalized);
	}
	for (const path of sourcePaths) {
		if (baseline.has(path)) return undefined;
		const normalized = normalizeRepoPath(input.projectDir, path);
		if (normalized === undefined || !recorded.has(normalized)) return undefined;
	}
	return dirtyPaths;
}

/** Repo-relative forward-slash form for path identity checks; lowercased on Windows, whose
 * filesystems are case-insensitive and where tools report drive letters in either case. Returns
 * undefined for paths outside the project. */
function normalizeRepoPath(projectDir: string, path: string): string | undefined {
	const rel = relative(projectDir, isAbsolute(path) ? path : join(projectDir, path));
	if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return undefined;
	const unified = rel.replaceAll('\\', '/');
	return process.platform === 'win32' ? unified.toLowerCase() : unified;
}

interface RecoveryGate {
	args: string[];
	display: string;
}

// The same gate ladder the coding prompt mandates: the full smoke:qc when the project defines
// it, else the fast subset. No recognizable gate means the tree cannot be proven — no recovery.
async function resolveRecoveryGate(projectDir: string): Promise<RecoveryGate | undefined> {
	let scripts: unknown;
	try {
		const pkg: unknown = await Bun.file(join(projectDir, 'package.json')).json();
		scripts = (pkg as { scripts?: unknown } | null)?.scripts;
	} catch {
		return undefined;
	}
	if (typeof scripts !== 'object' || scripts === null) return undefined;
	for (const script of ['smoke:qc', 'smoke:qc:fast']) {
		if (typeof (scripts as Record<string, unknown>)[script] === 'string') {
			return { args: ['bun', 'run', script], display: `bun run ${script}` };
		}
	}
	return undefined;
}

// Bun.spawn throws (rather than exiting non-zero) when the binary is missing; a clean machine
// without bun on PATH must degrade to "no recovery", never crash the run.
async function runRecoveryGate(
	projectDir: string,
	args: string[],
	timeoutMs: number
): Promise<boolean> {
	try {
		const proc = Bun.spawn(args, {
			cwd: projectDir,
			stderr: 'ignore',
			stdout: 'ignore',
			windowsHide: true,
		});
		const timer = setTimeout(() => proc.kill(), timeoutMs);
		const exitCode = await proc.exited;
		clearTimeout(timer);
		return exitCode === 0;
	} catch {
		return false;
	}
}

async function commitRecoveredWork(
	projectDir: string,
	featureId: string,
	featureTitle: unknown,
	gate: RecoveryGate,
	stagePaths: string[]
): Promise<GitCommitSummary | undefined> {
	const headBefore = await readGitHead(projectDir);
	// Explicit pathspecs only — the attributed dirty paths, never the whole tree. `-A` scoped to
	// these paths stages deletions as well as modifications; ignored files are never force-added.
	if (!(await gitSuccess(projectDir, ['add', '-A', '--', ...stagePaths]))) return undefined;
	const title =
		typeof featureTitle === 'string' && featureTitle.trim() !== ''
			? featureTitle.trim()
			: featureId;
	const subject = `feat(${featureId}): ${title}`.slice(0, 100);
	const committed = await gitSuccess(projectDir, [
		'commit',
		'-m',
		subject,
		'-m',
		'- auto-committed by aidd completion recovery: the backend exited before AIDD_RESULT with the feature completed and the tree unproven',
		'-m',
		`- recovery gate passed: ${gate.display}`,
	]);
	if (!committed) return undefined;
	const headAfter = await readGitHead(projectDir);
	if (headAfter === undefined || headAfter === headBefore) return undefined;
	return { hash: headAfter, subject };
}

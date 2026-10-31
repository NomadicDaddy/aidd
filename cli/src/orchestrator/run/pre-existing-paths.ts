import type { RunPlan } from 'aidd-shared/plan/types';

import { runRepoDir } from 'aidd-shared/plan/types';
import { preExistingChangedMarker } from 'aidd-shared/runs/outcome-preexisting';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	OrchestratorDeps,
	PreExistingChange,
	PreExistingChangeKind,
	PreExistingFileState,
	PreExistingPathWatch,
	RunAccumulator,
} from './types.ts';

import { gitOutput } from './git-exec.ts';

// Watches the paths that were already uncommitted when a run started. They belong to someone else,
// and the prompts tell the agent to leave them alone; this is the check that it did. Run-end status
// cannot do it, because a run can replace such a file to get its gate green and restore it byte for
// byte afterwards (keystrike iterations 136 and 137). Command names cannot either: the same run used
// git checkout once and git show with cp the next time. So the file itself is compared after every
// tool call.
//
// A working tree can be shared, so a change here may be a teammate's save and not the agent's. Every
// report says aidd cannot tell which, and none of them stops the run.

const howDescribed: Record<PreExistingChangeKind, string> = {
	changed: 'changed',
	committed: 'included in a commit',
	removed: 'removed',
	rewritten: 'rewritten with the same content',
	staged: 'staged differently',
};

async function readFileState(path: string): Promise<PreExistingFileState | undefined> {
	try {
		const info = await stat(path);
		if (!info.isFile()) return undefined;
		const bytes = await Bun.file(path).arrayBuffer();
		return { hash: Bun.SHA256.hash(new Uint8Array(bytes), 'hex'), mtimeMs: info.mtimeMs };
	} catch (err) {
		// Gone is a finding. Anything else, such as a lock on Windows, says nothing about the file.
		return (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : undefined;
	}
}

async function readFileStates(
	projectDir: string,
	paths: Iterable<string>,
): Promise<Map<string, PreExistingFileState | undefined>> {
	const states = new Map<string, PreExistingFileState | undefined>();
	for (const path of paths) states.set(path, await readFileState(join(projectDir, path)));
	return states;
}

// Index entries per watched path. Undefined when git could not answer, so a failed read is never
// reported as every path having been unstaged.
async function readIndexEntries(
	projectDir: string,
	paths: ReadonlySet<string>,
): Promise<Map<string, string> | undefined> {
	const output = await gitOutput(projectDir, ['ls-files', '--stage', '-z']);
	if (output === undefined) return undefined;
	const entries = new Map<string, string>();
	for (const line of output.split('\0')) {
		const tab = line.indexOf('\t');
		const path = line.slice(tab + 1);
		if (tab === -1 || !paths.has(path)) continue;
		// A conflicted path has one line per stage, so its entries are joined.
		entries.set(path, `${entries.get(path) ?? ''}${line.slice(0, tab)};`);
	}
	return entries;
}

function presentFileChange(
	before: PreExistingFileState,
	now: Exclude<PreExistingFileState, 'missing'>,
): PreExistingChangeKind | undefined {
	if (before === 'missing' || now.hash !== before.hash) return 'changed';
	// The same bytes with a new write time: replaced and restored inside a single tool call.
	return now.mtimeMs === before.mtimeMs ? undefined : 'rewritten';
}

function fileChange(
	before: PreExistingFileState | undefined,
	now: PreExistingFileState | undefined,
): PreExistingChangeKind | undefined {
	if (before === undefined || now === undefined) return undefined;
	if (now !== 'missing') return presentFileChange(before, now);
	return before === 'missing' ? undefined : 'removed';
}

function recordChange(watch: PreExistingPathWatch, path: string, how: PreExistingChangeKind): void {
	if (watch.changes.some((change) => change.path === path && change.how === how)) return;
	watch.changes.push({ how, path });
	console.warn(
		`[orchestrator] ${path} was already uncommitted when this run started and has been ${howDescribed[how]}, by this run or by someone else; aidd cannot tell which.`,
	);
}

/** Compare every watched path with its run-start state and record what differs. */
async function checkWatchedPaths(watch: PreExistingPathWatch, projectDir: string): Promise<void> {
	const states = await readFileStates(projectDir, watch.paths);
	for (const [path, state] of states) {
		const how = fileChange(watch.files.get(path), state);
		if (how !== undefined) recordChange(watch, path, how);
	}
	if (watch.index === undefined) return;
	const index = await readIndexEntries(projectDir, watch.paths);
	if (index === undefined) return;
	for (const path of watch.paths) {
		if (index.get(path) !== watch.index.get(path)) recordChange(watch, path, 'staged');
	}
}

/**
 * Remember the run-start state of the paths already uncommitted, and say that they will be left
 * alone.
 * @param projectDir The repository the run works in.
 * @param dirtyPaths Non-.aidd paths dirty at run start.
 * @returns The watch, or undefined when nothing was dirty and so there is nothing to compare.
 */
export async function capturePreExistingPathWatch(
	projectDir: string,
	dirtyPaths: readonly string[],
): Promise<PreExistingPathWatch | undefined> {
	if (dirtyPaths.length === 0) return undefined;
	const paths = new Set(dirtyPaths);
	console.warn(
		`[orchestrator] this run leaves ${String(paths.size)} file(s) that were already uncommitted alone: ${dirtyPaths.join(', ')}.`,
	);
	return {
		changes: [],
		files: await readFileStates(projectDir, paths),
		index: await readIndexEntries(projectDir, paths),
		iterationChanges: [],
		paths,
		settledChanges: 0,
	};
}

/**
 * Add the after-every-tool-call check to a run's observer. A run with nothing to watch gets its
 * dependencies back unchanged.
 * @param deps The run's dependencies.
 * @param acc The run accumulator holding the watch.
 * @param plan The run plan, for the repository to compare in.
 * @returns Dependencies whose observer also runs the check.
 */
export function withPreExistingPathWatch(
	deps: OrchestratorDeps,
	acc: RunAccumulator,
	plan: RunPlan,
): OrchestratorDeps {
	const watch = acc.preExistingPathWatch;
	if (watch === undefined) return deps;
	const projectDir = runRepoDir(plan);
	return {
		...deps,
		observer: {
			...deps.observer,
			onAgentEvent: async (event) => {
				await deps.observer?.onAgentEvent?.(event);
				// Both ends of a call: some backends report a call and never report its result.
				if (event.type === 'tool_call' || event.type === 'tool_result') {
					await checkWatchedPaths(watch, projectDir);
				}
			},
		},
	};
}

async function recordCommittedPaths(
	watch: PreExistingPathWatch,
	projectDir: string,
	headBefore: string | undefined,
	headAfter: string | undefined,
): Promise<void> {
	if (headBefore === undefined || headAfter === undefined || headBefore === headAfter) return;
	const names = await gitOutput(projectDir, ['diff', '--name-only', '-z', headBefore, headAfter]);
	for (const path of (names ?? '').split('\0')) {
		if (watch.paths.has(path)) recordChange(watch, path, 'committed');
	}
}

function correctionNote(changes: readonly PreExistingChange[]): string {
	const listed = changes.map((change) => `\`${change.path}\` (${howDescribed[change.how]})`);
	return (
		'**Files you did not make have changed.** These were already uncommitted when this run ' +
		`started: ${listed.join(', ')}. aidd cannot tell whether you did this or someone working ` +
		'alongside you did. If it was you, do not touch them again, and do not restore them yourself ' +
		'unless a user asks: name them in your final message so their owner can check them.'
	);
}

/**
 * Close an iteration's watch: a last comparison, the commits it made, and a note for the next
 * iteration if anything changed.
 * @param acc The run accumulator holding the watch.
 * @param plan The run plan, for the repository to compare in.
 * @param headBefore HEAD when the iteration started.
 * @param headAfter HEAD when the iteration ended.
 */
export async function settlePreExistingPathWatch(
	acc: RunAccumulator,
	plan: RunPlan,
	headBefore: string | undefined,
	headAfter: string | undefined,
): Promise<void> {
	const watch = acc.preExistingPathWatch;
	if (watch === undefined) return;
	const projectDir = runRepoDir(plan);
	await checkWatchedPaths(watch, projectDir);
	await recordCommittedPaths(watch, projectDir, headBefore, headAfter);
	watch.iterationChanges = watch.changes.slice(watch.settledChanges);
	watch.settledChanges = watch.changes.length;
	if (watch.iterationChanges.length > 0) {
		acc.pendingCarryoverNotes.push(correctionNote(watch.iterationChanges));
	}
}

/**
 * The run summary's sentence about these paths, for the marker the run outcome reads.
 * @param acc The run accumulator holding the watch.
 * @returns The sentence, or undefined when nothing changed.
 */
export function preExistingChangeSummary(acc: RunAccumulator): string | undefined {
	const changes = acc.preExistingPathWatch?.changes ?? [];
	if (changes.length === 0) return undefined;
	const paths = new Set(changes.map((change) => change.path));
	return `${preExistingChangedMarker} ${String(paths.size)} file(s) already uncommitted when this run started changed during it, by this run or by someone else: ${[...paths].join(', ')}`;
}

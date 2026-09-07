import { metadataPath } from 'aidd-shared/metadata/paths';
import { fileChangePathLimit } from 'aidd-shared/runs/file-changes';
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { GitCommitRefDto, RunRecord } from '../../types.ts';

import { pathIsInside } from '../../paths.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { readTextOrNull } from '../fsHelpers.ts';
import {
	commitRefsFromUnknown,
	iterationEntryNumber,
	type RawRunLedgerEntry,
} from '../projectMetadata/iterationParseHelpers.ts';

export type RunCommitsState = 'ledger-missing' | 'not-recorded' | 'ok' | 'run-not-found';
export type RunFileChangeSource = 'iteration-artifacts' | 'ledger' | 'unavailable';

export interface RunFileChangesDto {
	created: string[];
	edited: string[];
	source: RunFileChangeSource;
	truncated: boolean;
}

export interface RunCommitsResult {
	commits: GitCommitRefDto[];
	/** Total commits created during the run (from totals.commitsCreated), which may exceed the attributed list length. */
	commitsCreatedCount: number;
	fileChanges: RunFileChangesDto;
	filesCreated: number;
	filesEdited: number;
	reason: null | string;
	state: RunCommitsState;
}

interface IterationFileChangeArtifact {
	filesCreated?: unknown;
	filesEdited?: unknown;
	runId?: unknown;
}

function emptyFileChanges(): RunFileChangesDto {
	return {
		created: [],
		edited: [],
		source: 'unavailable',
		truncated: false,
	};
}

function recordValue(value: unknown): null | Record<string, unknown> {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function errorCode(value: unknown): string | undefined {
	const code = recordValue(value)?.code;
	return typeof code === 'string' ? code : undefined;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
		: [];
}

function displayFileChangePath(projectPath: string, path: string): string {
	const normalized = path.trim();
	if (!normalized) return '';
	if (isAbsolute(normalized)) {
		const resolvedProject = resolve(projectPath);
		const resolvedPath = resolve(normalized);
		if (pathIsInside(resolvedProject, resolvedPath)) {
			return relative(resolvedProject, resolvedPath).split(sep).join('/');
		}
	}
	return normalized.replaceAll('\\', '/');
}

function filePathArray(value: unknown, projectPath: string): string[] {
	return stringArray(value)
		.map((path) => displayFileChangePath(projectPath, path))
		.filter((path) => path.length > 0);
}

function limitedUniquePaths(paths: string[]): { paths: string[]; truncated: boolean } {
	const seen = new Set<string>();
	const result: string[] = [];
	let totalUnique = 0;
	for (const path of paths) {
		if (seen.has(path)) continue;
		seen.add(path);
		totalUnique++;
		if (result.length < fileChangePathLimit) result.push(path);
	}
	return { paths: result, truncated: totalUnique > fileChangePathLimit };
}

function buildFileChanges(input: {
	created: string[];
	edited: string[];
	source: RunFileChangeSource;
	truncated?: boolean;
}): RunFileChangesDto {
	const created = limitedUniquePaths(input.created);
	const edited = limitedUniquePaths(input.edited);
	return {
		created: created.paths,
		edited: edited.paths,
		source: input.source,
		truncated: input.truncated === true || created.truncated || edited.truncated,
	};
}

async function readIterationFileChanges(
	projectPath: string,
	runId: string,
): Promise<{ created: string[]; edited: string[] }> {
	const iterationsPath = metadataPath(projectPath, 'iterations');
	let entries: string[];
	try {
		entries = await readdir(iterationsPath);
	} catch (err) {
		if (errorCode(err) === 'ENOENT') return { created: [], edited: [] };
		throw err;
	}
	const iterationEntries = entries
		.map((entry) => ({ entry, index: iterationEntryNumber(entry) }))
		.filter((entry): entry is { entry: string; index: number } => entry.index !== null)
		.sort((a, b) => a.index - b.index);
	const created: string[] = [];
	const edited: string[] = [];
	for (const { entry } of iterationEntries) {
		let parsed: IterationFileChangeArtifact;
		try {
			parsed = JSON.parse(
				await readFile(join(iterationsPath, entry), 'utf8'),
			) as IterationFileChangeArtifact;
		} catch {
			continue;
		}
		if (parsed.runId !== runId) continue;
		created.push(...filePathArray(parsed.filesCreated, projectPath));
		edited.push(...filePathArray(parsed.filesEdited, projectPath));
	}
	return { created, edited };
}

async function fileChangesForRun(
	projectPath: string,
	runId: string,
	ledgerEntry: RawRunLedgerEntry,
	filesCreated: number,
	filesEdited: number,
): Promise<RunFileChangesDto> {
	if (Array.isArray(ledgerEntry.filesCreated) || Array.isArray(ledgerEntry.filesEdited)) {
		return buildFileChanges({
			created: filePathArray(ledgerEntry.filesCreated, projectPath),
			edited: filePathArray(ledgerEntry.filesEdited, projectPath),
			source: 'ledger',
			truncated: ledgerEntry.fileChangePathsTruncated === true,
		});
	}
	if (filesCreated === 0 && filesEdited === 0) return emptyFileChanges();
	const iterationChanges = await readIterationFileChanges(projectPath, runId);
	if (iterationChanges.created.length > 0 || iterationChanges.edited.length > 0) {
		return buildFileChanges({
			...iterationChanges,
			source: 'iteration-artifacts',
		});
	}
	return emptyFileChanges();
}

// Commits are read lazily from the project's runs.jsonl ledger rather than copied into the web
// DB: the ledger line is appended once at run finalization and never rewritten, and reading it
// on demand makes commits visible for historical and CLI-launched runs the DB never tracked.
// A ledger line with no runId (a run that died before finalization) surfaces as
// 'not-recorded' rather than guessing a match by time window.
export async function readRunCommits(
	run: null | RunRecord | undefined,
	id: string,
): Promise<RunCommitsResult> {
	if (!run) {
		return {
			commits: [],
			commitsCreatedCount: 0,
			fileChanges: emptyFileChanges(),
			filesCreated: 0,
			filesEdited: 0,
			reason: `Run not found: ${id}`,
			state: 'run-not-found',
		};
	}
	const ledgerPath = metadataPath(run.projectPath, 'runs.jsonl');
	const content = await readTextOrNull(ledgerPath);
	if (content === null) {
		recordDataMovement({
			category: 'metadata',
			operation: 'run.commits.read',
			status: 'miss',
			summary: { runId: id },
			target: ledgerPath,
		});
		return {
			commits: [],
			commitsCreatedCount: 0,
			fileChanges: emptyFileChanges(),
			filesCreated: 0,
			filesEdited: 0,
			reason: 'The project has no run ledger on disk.',
			state: 'ledger-missing',
		};
	}
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed: RawRunLedgerEntry;
		try {
			parsed = JSON.parse(trimmed) as RawRunLedgerEntry;
		} catch {
			continue;
		}
		if (parsed.runId !== id) continue;
		const commits = commitRefsFromUnknown(parsed.commitsCreated);
		const totals = recordValue(parsed.totals);
		// Without a totals.commitsCreated number, fall back to the filtered valid commit
		// count — not the raw commitsCreated array length, which would inflate the count
		// with malformed entries (bad hash, missing subject) that commitRefsFromUnknown drops.
		const commitsCreatedCount =
			typeof totals?.commitsCreated === 'number' ? totals.commitsCreated : commits.length;
		const filesCreated = typeof totals?.filesCreated === 'number' ? totals.filesCreated : 0;
		const filesEdited = typeof totals?.filesEdited === 'number' ? totals.filesEdited : 0;
		const fileChanges = await fileChangesForRun(
			run.projectPath,
			id,
			parsed,
			filesCreated,
			filesEdited,
		);
		recordDataMovement({
			category: 'metadata',
			operation: 'run.commits.read',
			status: 'success',
			summary: { count: commits.length, runId: id },
			target: ledgerPath,
		});
		return {
			commits,
			commitsCreatedCount,
			fileChanges,
			filesCreated,
			filesEdited,
			reason: null,
			state: 'ok',
		};
	}
	recordDataMovement({
		category: 'metadata',
		operation: 'run.commits.read',
		status: 'miss',
		summary: { runId: id },
		target: ledgerPath,
	});
	return {
		commits: [],
		commitsCreatedCount: 0,
		fileChanges: emptyFileChanges(),
		filesCreated: 0,
		filesEdited: 0,
		reason: 'The run ledger has no entry for this run.',
		state: 'not-recorded',
	};
}

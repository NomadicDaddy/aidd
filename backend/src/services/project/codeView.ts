import { open, realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import type {
	ProjectCodeFileEntry,
	ProjectCodeFileResult,
	ProjectCodeFileState,
	ProjectCodeTreeResult,
	ProjectCodeTreeState,
} from './codeViewTypes.ts';

import { pathIsInside } from '../../paths.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { statOrNull } from '../fsHelpers.ts';
import { languageForPath } from '../git/repoLanguages.ts';
import { runGit } from '../git/runGit.ts';
import { readProjectCodeImageFile } from './codeViewImages.ts';

export type { ProjectCodeFileResult, ProjectCodeTreeResult } from './codeViewTypes.ts';

const commandTimeoutMs = 5_000;
const maxTreeFiles = 10_000;
/** Paths stat'ed concurrently per batch: enough to hide the per-call latency, few enough not to open thousands of handles at once. */
const STAT_BATCH_SIZE = 64;
const maxCodeFileBytes = 768 * 1024;

function failureTree(state: ProjectCodeTreeState, reason: string): ProjectCodeTreeResult {
	return { files: [], reason, state, totalFiles: 0, truncated: false };
}

function failureFile(state: ProjectCodeFileState, reason: string): ProjectCodeFileResult {
	return {
		content: '',
		language: null,
		path: '',
		reason,
		sizeBytes: 0,
		state,
		totalBytes: 0,
		truncated: false,
	};
}

async function detectWorkTree(projectPath: string): Promise<null | ProjectCodeTreeResult> {
	const dirStat = await statOrNull(projectPath);
	if (!dirStat?.isDirectory()) {
		return failureTree('project-missing', 'The project directory does not exist on disk.');
	}
	const probe = await runGit(
		projectPath,
		['rev-parse', '--is-inside-work-tree'],
		commandTimeoutMs,
	);
	if (probe.ok && probe.stdout.trim() === 'true') return null;
	if (probe.timedOut)
		return failureTree('error', 'git timed out while inspecting the repository.');
	return failureTree('not-a-repo', 'The project directory is not a git repository.');
}

function normalizeRequestPath(requestedPath: string): null | string {
	if (!requestedPath || requestedPath.includes('\0')) return null;
	const normalized = requestedPath.split('\\').join('/');
	if (isAbsolute(requestedPath) || isAbsolute(normalized) || /^[A-Za-z]:/.test(requestedPath)) {
		return null;
	}
	if (normalized.startsWith(':')) return null;
	if (normalized.split('/').includes('..')) return null;
	return normalized;
}

function nameForPath(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash === -1 ? path : path.slice(slash + 1);
}

async function gitTrackedPath(projectPath: string, normalizedPath: string): Promise<boolean> {
	const result = await runGit(
		projectPath,
		['ls-files', '--error-unmatch', '--', normalizedPath],
		commandTimeoutMs,
	);
	return result.ok;
}

function hasBinaryMarker(buffer: Buffer): boolean {
	for (let index = 0; index < buffer.length; index += 1) {
		if (buffer[index] === 0) return true;
	}
	return false;
}

export async function readProjectCodeTree(projectPath: string): Promise<ProjectCodeTreeResult> {
	const notRepo = await detectWorkTree(projectPath);
	if (notRepo) return notRepo;

	const tracked = await runGit(projectPath, ['ls-files', '-z'], commandTimeoutMs);
	if (!tracked.ok) {
		return failureTree(
			tracked.timedOut ? 'error' : 'not-a-repo',
			tracked.timedOut
				? 'git timed out while listing tracked files.'
				: 'Tracked files could not be listed.',
		);
	}
	const allPaths = tracked.stdout.split('\0').filter((entry) => entry.length > 0);
	const truncated = allPaths.length > maxTreeFiles;
	const visiblePaths = truncated ? allPaths.slice(0, maxTreeFiles) : allPaths;
	const files: ProjectCodeFileEntry[] = [];
	// Stat in bounded batches rather than one await per path: at the 10,000-file cap the
	// sequential loop was 10,000 round trips through the event loop per tree request.
	for (let start = 0; start < visiblePaths.length; start += STAT_BATCH_SIZE) {
		const batch = visiblePaths.slice(start, start + STAT_BATCH_SIZE);
		const stats = await Promise.all(
			batch.map((path) => statOrNull(resolve(projectPath, path))),
		);
		for (let index = 0; index < batch.length; index += 1) {
			const path = batch[index];
			const stat = stats[index];
			if (path === undefined || !stat?.isFile()) continue;
			files.push({
				language: languageForPath(path),
				name: nameForPath(path),
				path,
				sizeBytes: stat.size,
			});
		}
	}
	files.sort((left, right) => left.path.localeCompare(right.path));
	recordDataMovement({
		category: 'file',
		operation: 'project.code.tree',
		status: 'hit',
		summary: { files: files.length, totalFiles: allPaths.length, truncated },
		target: projectPath,
	});
	return { files, reason: null, state: 'ok', totalFiles: allPaths.length, truncated };
}

export async function readProjectCodeFile(
	projectPath: string,
	requestedPath: string,
): Promise<ProjectCodeFileResult> {
	const notRepo = await detectWorkTree(projectPath);
	if (notRepo) return failureFile(notRepo.state, notRepo.reason ?? 'Repository unavailable.');

	const normalized = normalizeRequestPath(requestedPath);
	if (normalized === null)
		return failureFile('invalid-path', 'A tracked relative path is required.');
	const resolved = resolve(projectPath, normalized);
	if (!pathIsInside(projectPath, resolved)) {
		return failureFile('invalid-path', 'The path is outside the project directory.');
	}
	if (!(await gitTrackedPath(projectPath, normalized))) {
		return failureFile('invalid-path', 'The file is not tracked by git.');
	}

	let realProjectPath: string;
	let realPath: string;
	try {
		[realProjectPath, realPath] = await Promise.all([
			realpath(projectPath),
			realpath(resolved),
		]);
	} catch {
		return {
			...failureFile('missing', 'The tracked file does not exist on disk.'),
			language: languageForPath(normalized),
			path: normalized,
		};
	}
	if (!pathIsInside(realProjectPath, realPath)) {
		return failureFile('invalid-path', 'The path resolves outside the project directory.');
	}

	const stat = await statOrNull(resolved);
	if (!stat?.isFile()) {
		return {
			...failureFile('missing', 'The tracked path is not a readable file.'),
			language: languageForPath(normalized),
			path: normalized,
		};
	}

	const totalBytes = stat.size;
	const imageFile = await readProjectCodeImageFile({
		normalizedPath: normalized,
		resolvedPath: resolved,
		totalBytes,
	});
	if (imageFile) return imageFile;
	const truncated = totalBytes > maxCodeFileBytes;
	const bytesToRead = truncated ? maxCodeFileBytes : totalBytes;
	const handle = await open(resolved, 'r');
	let buffer: Buffer;
	try {
		buffer = Buffer.allocUnsafe(bytesToRead);
		await handle.read(buffer, 0, bytesToRead, 0);
	} finally {
		await handle.close();
	}
	if (hasBinaryMarker(buffer)) {
		return {
			content: '',
			language: languageForPath(normalized),
			path: normalized,
			reason: 'Binary files are not rendered in the code viewer.',
			sizeBytes: totalBytes,
			state: 'binary',
			totalBytes,
			truncated: false,
		};
	}
	let content = buffer.toString('utf8');
	if (truncated) {
		const lastNewline = content.lastIndexOf('\n');
		if (lastNewline !== -1) content = content.slice(0, lastNewline + 1);
	}
	recordDataMovement({
		category: 'file',
		operation: 'project.code.file',
		status: 'hit',
		summary: { bytes: content.length, path: normalized, truncated },
		target: resolved,
	});
	return {
		content,
		language: languageForPath(normalized),
		path: normalized,
		reason: null,
		sizeBytes: totalBytes,
		state: 'ok',
		totalBytes,
		truncated,
	};
}

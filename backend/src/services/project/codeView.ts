import { open, realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { pathIsInside } from '../../paths.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { statOrNull } from '../fsHelpers.ts';
import { languageForPath } from '../git/repoLanguages.ts';
import { readProjectCodeImageFile } from './codeViewImages.ts';

export type ProjectCodeFileState =
	| 'binary'
	| 'error'
	| 'image'
	| 'invalid-path'
	| 'missing'
	| 'not-a-repo'
	| 'ok'
	| 'project-missing';
export type ProjectCodeTreeState = 'error' | 'not-a-repo' | 'ok' | 'project-missing';

export interface ProjectCodeFileEntry {
	language: null | string;
	name: string;
	path: string;
	sizeBytes: number;
}

export interface ProjectCodeTreeResult {
	files: ProjectCodeFileEntry[];
	reason: null | string;
	state: ProjectCodeTreeState;
	totalFiles: number;
	truncated: boolean;
}

export interface ProjectCodeFileResult {
	content: string;
	language: null | string;
	path: string;
	reason: null | string;
	sizeBytes: number;
	state: ProjectCodeFileState;
	totalBytes: number;
	truncated: boolean;
}

interface GitOutput {
	ok: boolean;
	stderr: string;
	stdout: string;
	timedOut: boolean;
}

const commandTimeoutMs = 5_000;
const maxTreeFiles = 10_000;
const maxCodeFileBytes = 768 * 1024;

async function runGit(cwd: string, args: string[]): Promise<GitOutput> {
	let subprocess: ReturnType<typeof Bun.spawn>;
	try {
		subprocess = Bun.spawn(['git', ...args], {
			cwd,
			stderr: 'pipe',
			stdin: 'ignore',
			stdout: 'pipe',
			windowsHide: true,
		});
	} catch (err) {
		const stderr = err instanceof Error ? err.message : String(err);
		return { ok: false, stderr, stdout: '', timedOut: false };
	}
	const readStream = (stream: unknown): Promise<string> =>
		stream instanceof ReadableStream ? new Response(stream).text() : Promise.resolve('');
	const settled = (async () => {
		const [stdout, stderr, exitCode] = await Promise.all([
			readStream(subprocess.stdout),
			readStream(subprocess.stderr),
			subprocess.exited,
		]);
		return { exitCode, stderr, stdout };
	})();
	const race = await Promise.race([
		settled,
		Bun.sleep(commandTimeoutMs).then(() => 'timeout' as const),
	]);
	if (race === 'timeout') {
		subprocess.kill();
		return { ok: false, stderr: `git ${args[0]} timed out`, stdout: '', timedOut: true };
	}
	return { ok: race.exitCode === 0, stderr: race.stderr, stdout: race.stdout, timedOut: false };
}

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
	const probe = await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
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
	const result = await runGit(projectPath, ['ls-files', '--error-unmatch', '--', normalizedPath]);
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

	const tracked = await runGit(projectPath, ['ls-files', '-z']);
	if (!tracked.ok) {
		return failureTree(
			tracked.timedOut ? 'error' : 'not-a-repo',
			tracked.timedOut
				? 'git timed out while listing tracked files.'
				: 'Tracked files could not be listed.'
		);
	}
	const allPaths = tracked.stdout.split('\0').filter((entry) => entry.length > 0);
	const truncated = allPaths.length > maxTreeFiles;
	const visiblePaths = truncated ? allPaths.slice(0, maxTreeFiles) : allPaths;
	const files: ProjectCodeFileEntry[] = [];
	for (const path of visiblePaths) {
		const stat = await statOrNull(resolve(projectPath, path));
		if (!stat?.isFile()) continue;
		files.push({
			language: languageForPath(path),
			name: nameForPath(path),
			path,
			sizeBytes: stat.size,
		});
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
	requestedPath: string
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

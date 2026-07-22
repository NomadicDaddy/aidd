import { metadataPath } from 'aidd-shared/metadata/paths';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { pathIsInside } from '../../paths.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { statOrNull } from '../fsHelpers.ts';

export type ProjectFileKind = 'json' | 'markdown' | 'text';
export type ProjectFileState = 'invalid-path' | 'missing' | 'ok';

export interface ProjectFileResult {
	content: string;
	kind: ProjectFileKind;
	/** Normalized project-root-relative POSIX path of the file that was read. */
	path: string;
	reason: null | string;
	state: ProjectFileState;
	totalBytes: number;
	/** True when `content` carries only the leading window of a file larger than the cap. */
	truncated: boolean;
}

// Reads are confined to the project's `.aidd/` metadata directory, plus a short allowlist of
// project-root files that the artifact check tracks outside it. Widening access beyond curated
// artifacts is a deliberate decision, not a path tweak.
const rootReadablePaths = new Set(['CONTEXT.md']);
const maxFileBytes = 1024 * 1024;

function invalidPath(reason: string): ProjectFileResult {
	return {
		content: '',
		kind: 'text',
		path: '',
		reason,
		state: 'invalid-path',
		totalBytes: 0,
		truncated: false,
	};
}

function fileKind(path: string): ProjectFileKind {
	const lower = path.toLowerCase();
	if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
	if (lower.endsWith('.json')) return 'json';
	return 'text';
}

function normalizedRelativePath(projectPath: string, resolved: string): string {
	return relative(projectPath, resolved).split(sep).join('/');
}

function isWithinReadableScope(projectPath: string, candidate: string): boolean {
	if (pathIsInside(metadataPath(projectPath), candidate)) return true;
	return rootReadablePaths.has(normalizedRelativePath(projectPath, candidate));
}

export async function readProjectFile(
	projectPath: string,
	requestedPath: string
): Promise<ProjectFileResult> {
	// Reject anything that is not a plain relative path before resolving. `..` segments and
	// absolute paths (in either separator style) never have a legitimate use here.
	if (!requestedPath || requestedPath.includes('\0')) {
		return invalidPath('A relative file path is required.');
	}
	const normalizedRequest = requestedPath.split('\\').join('/');
	if (
		isAbsolute(requestedPath) ||
		isAbsolute(normalizedRequest) ||
		/^[A-Za-z]:/.test(requestedPath)
	) {
		return invalidPath('Absolute paths are not allowed.');
	}
	if (normalizedRequest.split('/').includes('..')) {
		return invalidPath('Parent-directory segments are not allowed.');
	}

	const resolved = resolve(projectPath, normalizedRequest);
	if (!isWithinReadableScope(projectPath, resolved)) {
		return invalidPath('The path is outside the readable project metadata scope.');
	}

	// Re-check the real location so a symlink inside .aidd/ cannot point reads elsewhere.
	let realPath: string;
	try {
		realPath = await realpath(resolved);
	} catch {
		recordDataMovement({
			category: 'file',
			operation: 'project.file.read',
			status: 'miss',
			summary: { path: normalizedRelativePath(projectPath, resolved) },
			target: resolved,
		});
		return {
			content: '',
			kind: fileKind(resolved),
			path: normalizedRelativePath(projectPath, resolved),
			reason: 'The file does not exist on disk.',
			state: 'missing',
			totalBytes: 0,
			truncated: false,
		};
	}
	let realProjectPath: string;
	try {
		realProjectPath = await realpath(projectPath);
	} catch {
		return invalidPath('The project directory could not be resolved.');
	}
	if (!isWithinReadableScope(realProjectPath, realPath)) {
		return invalidPath('The path is outside the readable project metadata scope.');
	}

	const relativePath = normalizedRelativePath(projectPath, resolved);
	const fileStat = await statOrNull(resolved);
	if (!fileStat || fileStat.isDirectory()) {
		return {
			content: '',
			kind: fileKind(resolved),
			path: relativePath,
			reason: fileStat
				? 'The path is a directory, not a file.'
				: 'The file does not exist on disk.',
			state: 'missing',
			totalBytes: 0,
			truncated: false,
		};
	}

	const totalBytes = fileStat.size;
	const truncated = totalBytes > maxFileBytes;
	let content: string;
	if (!truncated) {
		const handle = await open(resolved, 'r');
		try {
			const buffer = Buffer.allocUnsafe(totalBytes);
			await handle.read(buffer, 0, totalBytes, 0);
			content = buffer.toString('utf8');
		} finally {
			await handle.close();
		}
	} else {
		// Head window: artifacts are read top-down (unlike run transcripts, where the tail is the
		// interesting part). Cut at the last newline so the response never ends mid-line.
		const handle = await open(resolved, 'r');
		try {
			const buffer = Buffer.allocUnsafe(maxFileBytes);
			await handle.read(buffer, 0, maxFileBytes, 0);
			const decoded = buffer.toString('utf8');
			const lastNewline = decoded.lastIndexOf('\n');
			content = lastNewline === -1 ? decoded : decoded.slice(0, lastNewline + 1);
		} finally {
			await handle.close();
		}
	}

	recordDataMovement({
		category: 'file',
		operation: 'project.file.read',
		status: 'hit',
		summary: { bytes: content.length, path: relativePath, truncated },
		target: resolved,
	});
	return {
		content,
		kind: fileKind(resolved),
		path: relativePath,
		reason: null,
		state: 'ok',
		totalBytes,
		truncated,
	};
}

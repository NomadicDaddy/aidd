import { Glob } from 'bun';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { resolveWorkspacePath } from './constants.ts';

export function readWorkspaceFile(args: Record<string, unknown>, cwd: string): string {
	const resolved = resolveWorkspacePath(args.path, cwd);
	if ('error' in resolved) return resolved.error;
	if (!existsSync(resolved.path)) return `ERROR: File not found: ${resolved.path}`;
	try {
		const stats = statSync(resolved.path);
		if (stats.isDirectory()) {
			return `ERROR: Path is a directory, not a file: ${resolved.path} (use list_directory instead)`;
		}
	} catch (error) {
		return `ERROR: Could not stat path: ${resolved.path} (${error instanceof Error ? error.message : String(error)})`;
	}
	let content: string;
	try {
		content = readFileSync(resolved.path, 'utf8');
	} catch (error) {
		return `ERROR: Could not read file: ${resolved.path} (${error instanceof Error ? error.message : String(error)})`;
	}
	const lines = content.split('\n');
	const offset = typeof args.offset === 'number' ? args.offset : 0;
	const limit = typeof args.limit === 'number' ? args.limit : Math.min(lines.length, 2000);
	return lines
		.slice(offset, offset + limit)
		.map((line, index) => `${String(offset + index + 1).padStart(6)}| ${line}`)
		.join('\n');
}

export function writeWorkspaceFile(args: Record<string, unknown>, cwd: string): string {
	const resolved = resolveWorkspacePath(args.path, cwd);
	if ('error' in resolved) return resolved.error;
	if (typeof args.content !== 'string') return 'ERROR: content must be a string';
	mkdirSync(dirname(resolved.path), { recursive: true });
	writeFileSync(resolved.path, args.content, 'utf8');
	return `File written successfully: ${resolved.path}`;
}

export function editWorkspaceFile(args: Record<string, unknown>, cwd: string): string {
	const resolved = resolveWorkspacePath(args.path, cwd);
	if ('error' in resolved) return resolved.error;
	if (!existsSync(resolved.path)) return `ERROR: File not found: ${resolved.path}`;
	if (typeof args.old_string !== 'string' || typeof args.new_string !== 'string') {
		return 'ERROR: old_string and new_string must be strings';
	}
	const content = readFileSync(resolved.path, 'utf8');
	const index = content.indexOf(args.old_string);
	if (index === -1) return 'ERROR: old_string not found in file';
	writeFileSync(
		resolved.path,
		content.slice(0, index) + args.new_string + content.slice(index + args.old_string.length),
		'utf8'
	);
	return `File edited successfully: ${resolved.path}`;
}

export async function globWorkspace(args: Record<string, unknown>, cwd: string): Promise<string> {
	if (typeof args.pattern !== 'string' || args.pattern.trim() === '') {
		return 'ERROR: pattern must be a non-empty string';
	}
	const resolved = resolveWorkspacePath(args.path ?? '.', cwd);
	if ('error' in resolved) return resolved.error;
	try {
		const glob = new Glob(args.pattern);
		const matches: string[] = [];
		for await (const file of glob.scan({ cwd: resolved.path, dot: false })) {
			matches.push(file);
			if (matches.length >= 500) break;
		}
		if (matches.length === 0) return 'No files found matching pattern.';
		return `${matches.join('\n')}${matches.length >= 500 ? '\n... (results capped at 500 files)' : ''}`;
	} catch (error) {
		return `ERROR: Glob failed: ${error instanceof Error ? error.message : String(error)}`;
	}
}

export function listWorkspaceDirectory(args: Record<string, unknown>, cwd: string): string {
	const resolved = resolveWorkspacePath(args.path, cwd);
	if ('error' in resolved) return resolved.error;
	if (!existsSync(resolved.path)) return `ERROR: Directory not found: ${resolved.path}`;
	const entries = readdirSync(resolved.path);
	if (entries.length === 0) return '(empty directory)';
	return entries
		.map((entry) => {
			const path = join(resolved.path, entry);
			return statSync(path).isDirectory() ? `${entry}/` : entry;
		})
		.join('\n');
}

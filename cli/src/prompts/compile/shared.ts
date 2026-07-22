import type { PromptPlan } from 'aidd-shared/plan/types';

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

let cachedBashPathPrefix: '/' | '/mnt/' | undefined;

// Resolved lazily and cached: only prompt compilation (which emits bash-style paths) needs it, so
// commands like --version/--check-features never probe. On a clean Windows box with no Git Bash or
// WSL, `bash` is absent and Bun.spawnSync throws ENOENT rather than returning a non-zero exit — that
// throw must not crash the CLI, so fall back to the filesystem probe.
function bashPathPrefix(): '/' | '/mnt/' {
	if (cachedBashPathPrefix === undefined) cachedBashPathPrefix = detectBashPathPrefix();
	return cachedBashPathPrefix;
}

function detectBashPathPrefix(): '/' | '/mnt/' {
	try {
		const probe = Bun.spawnSync(['bash', '-c', 'test -d /mnt/c && echo wsl || echo gitbash']);
		if (probe.exitCode === 0) {
			return probe.stdout.toString().trim() === 'wsl' ? '/mnt/' : '/';
		}
	} catch {
		// bash not on PATH — fall through to the filesystem probe below.
	}
	return existsSync('/mnt/c') ? '/mnt/' : '/';
}

export function normalizePromptPath(path: string): string {
	const slashPath = path.replaceAll('\\', '/');
	const match = slashPath.match(/^([A-Za-z]):\/(.*)$/);
	if (!match?.[1] || !match[2]) return slashPath;
	return `${bashPathPrefix()}${match[1].toLowerCase()}/${match[2]}`;
}

export async function readFragment(rootDir: string, path?: string): Promise<string> {
	if (!path) return '';
	try {
		return await readFile(join(rootDir, path), 'utf8');
	} catch (err) {
		if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT') {
			return '';
		}
		throw err;
	}
}

export function stringVariable(plan: PromptPlan, key: string): string | undefined {
	const value = plan.variables[key];
	return typeof value === 'string' ? value : undefined;
}

export function stringArrayVariable(plan: PromptPlan, key: string): string[] {
	const value = plan.variables[key];
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
		: [];
}

export function booleanVariable(plan: PromptPlan, key: string): boolean {
	return plan.variables[key] === true;
}

export function numberVariable(plan: PromptPlan, key: string, fallback: number): number {
	const value = plan.variables[key];
	return typeof value === 'number' ? value : fallback;
}

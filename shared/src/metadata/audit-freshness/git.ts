import type { AuditChangeCounts } from './metadata.ts';

export interface AuditFreshnessContext {
	currentHead?: Promise<null | string>;
	gitNumstatLogs?: Map<string, Promise<null | string>>;
	isGitWorktree?: Promise<boolean>;
}

export function createAuditFreshnessContext(): AuditFreshnessContext {
	return { gitNumstatLogs: new Map() };
}

const excludedPathSegments = new Set([
	'.aidd',
	'.git',
	'build',
	'coverage',
	'data',
	'dist',
	'docs',
	'logs',
	'node_modules',
	'out',
	'screenshots',
	'temp',
	'tmp',
	'upgrade-review',
]);

const excludedFileExtensions = new Set([
	'.bmp',
	'.db',
	'.gif',
	'.ico',
	'.jpeg',
	'.jpg',
	'.log',
	'.md',
	'.mp4',
	'.pdf',
	'.png',
	'.sqlite',
	'.sqlite3',
	'.tsbuildinfo',
	'.webm',
	'.webp',
]);

export async function currentGitHead(
	projectDir: string,
	context: AuditFreshnessContext
): Promise<null | string> {
	if (!(await isGitWorktree(projectDir, context))) return null;
	context.currentHead ??= gitOutput(projectDir, ['rev-parse', 'HEAD']).then(
		(output) => output?.trim() || null
	);
	return await context.currentHead;
}

export async function isGitWorktree(
	projectDir: string,
	context: AuditFreshnessContext
): Promise<boolean> {
	context.isGitWorktree ??= gitOutput(projectDir, ['rev-parse', '--is-inside-work-tree']).then(
		(output) => output?.trim() === 'true'
	);
	return await context.isGitWorktree;
}

async function gitOutput(projectDir: string, args: string[]): Promise<null | string> {
	const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) !== 0) return null;
	return await new Response(proc.stdout).text();
}

export async function cachedGitNumstatOutput(
	projectDir: string,
	args: string[],
	context: AuditFreshnessContext
): Promise<null | string> {
	const cache = (context.gitNumstatLogs ??= new Map());
	const key = JSON.stringify([projectDir, ...args]);
	let promise = cache.get(key);
	if (!promise) {
		promise = gitOutput(projectDir, args);
		cache.set(key, promise);
	}
	return await promise;
}

export function parseGitNumstatLog(output: string): AuditChangeCounts {
	const commits = new Set<string>();
	const files = new Set<string>();
	let currentCommit: null | string = null;
	let currentCommitTouchedSource = false;
	let sourceLines = 0;

	for (const line of output.split(/\r?\n/)) {
		if (line.startsWith('commit:')) {
			if (currentCommit && currentCommitTouchedSource) commits.add(currentCommit);
			currentCommit = line.slice('commit:'.length).trim();
			currentCommitTouchedSource = false;
			continue;
		}
		if (line.trim() === '') continue;
		const parts = line.split('\t');
		if (parts.length < 3) continue;
		const path = parts.slice(2).join('\t');
		if (!isSourceRelevantPath(path)) continue;
		currentCommitTouchedSource = true;
		files.add(normalizeGitPath(path));
		sourceLines += numericNumstatValue(parts[0]) + numericNumstatValue(parts[1]);
	}
	if (currentCommit && currentCommitTouchedSource) commits.add(currentCommit);

	return {
		codeCommits: commits.size,
		sourceFiles: files.size,
		sourceLines,
	};
}

function numericNumstatValue(value: string | undefined): number {
	if (!value) return 0;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function isSourceRelevantPath(path: string): boolean {
	const normalized = normalizeGitPath(path);
	const segments = normalized.split('/');
	if (segments.some((segment) => excludedPathSegments.has(segment))) return false;
	const filename = segments[segments.length - 1] ?? '';
	const lower = filename.toLowerCase();
	if (lower === 'changelog' || lower === 'changelog.md') return false;
	for (const extension of excludedFileExtensions) {
		if (lower.endsWith(extension)) return false;
	}
	return true;
}

function normalizeGitPath(path: string): string {
	return path.replace(/\\/g, '/').toLowerCase();
}

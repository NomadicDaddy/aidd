import { statOrNull } from '../fsHelpers.ts';
import { type GitOutput, runGit } from './runGit.ts';

export type ProjectGitStatusState =
	'clean' | 'conflicted' | 'dirty' | 'error' | 'not-a-repo' | 'project-missing';

export interface ProjectGitStatusSummary {
	ahead: number;
	behind: number;
	branch: null | string;
	conflicted: number;
	staged: number;
	state: ProjectGitStatusState;
	total: number;
	unstaged: number;
	untracked: number;
}

export interface ProjectGitStatusMapEntry {
	id: string;
	path: string;
	status: ProjectGitStatusSummary;
}

const commandTimeoutMs = 3_000;
const maxConcurrentStatusReads = 6;
const statusMapCacheTtlMs = 2_000;
const maxStatusMapCacheEntries = 8;

interface StatusMapCacheEntry {
	expiresAt: number;
	value: Promise<Record<string, ProjectGitStatusMapEntry>>;
}

const statusMapCache = new Map<string, StatusMapCacheEntry>();

const emptyStatus: Omit<ProjectGitStatusSummary, 'state'> = {
	ahead: 0,
	behind: 0,
	branch: null,
	conflicted: 0,
	staged: 0,
	total: 0,
	unstaged: 0,
	untracked: 0,
};

function runGitStatus(projectPath: string): Promise<GitOutput> {
	return runGit(
		projectPath,
		['status', '--porcelain=v1', '--branch', '--untracked-files=all'],
		commandTimeoutMs,
	);
}

function parseBranchLine(
	line: string,
): Pick<ProjectGitStatusSummary, 'ahead' | 'behind' | 'branch'> {
	const raw = line.replace(/^##\s*/, '').trim();
	const ahead = Number(/\bahead\s+(\d+)/.exec(raw)?.[1] ?? 0);
	const behind = Number(/\bbehind\s+(\d+)/.exec(raw)?.[1] ?? 0);
	const withoutCounts = raw.replace(/\s+\[[^\]]+\]\s*$/, '');
	if (withoutCounts.startsWith('No commits yet on ')) {
		return {
			ahead,
			behind,
			branch: withoutCounts.slice('No commits yet on '.length).trim() || null,
		};
	}
	const branch = withoutCounts.split('...')[0]?.trim();
	const detached = branch === 'HEAD' || branch?.startsWith('HEAD ');
	return { ahead, behind, branch: branch && !detached ? branch : null };
}

function isConflictStatus(status: string): boolean {
	return ['AA', 'AU', 'DD', 'DU', 'UA', 'UD', 'UU'].includes(status);
}

function parsePorcelain(stdout: string): ProjectGitStatusSummary {
	const summary: ProjectGitStatusSummary = { ...emptyStatus, state: 'clean' };
	for (const line of stdout.split(/\r?\n/)) {
		if (!line) continue;
		if (line.startsWith('## ')) {
			Object.assign(summary, parseBranchLine(line));
			continue;
		}
		if (line.length < 2) continue;
		const status = line.slice(0, 2);
		summary.total += 1;
		if (status === '??') {
			summary.untracked += 1;
			continue;
		}
		if (isConflictStatus(status)) {
			summary.conflicted += 1;
			continue;
		}
		const [indexStatus, worktreeStatus] = status;
		if (indexStatus && indexStatus !== ' ' && indexStatus !== '!') summary.staged += 1;
		if (worktreeStatus && worktreeStatus !== ' ' && worktreeStatus !== '!')
			summary.unstaged += 1;
	}
	summary.state = summary.conflicted > 0 ? 'conflicted' : summary.total > 0 ? 'dirty' : 'clean';
	return summary;
}

function failure(
	state: Exclude<ProjectGitStatusState, 'clean' | 'conflicted' | 'dirty'>,
): ProjectGitStatusSummary {
	return { ...emptyStatus, state };
}

export async function readProjectGitStatus(projectPath: string): Promise<ProjectGitStatusSummary> {
	const dirStat = await statOrNull(projectPath);
	if (!dirStat?.isDirectory()) return failure('project-missing');
	const result = await runGitStatus(projectPath);
	if (result.ok) return parsePorcelain(result.stdout);
	if (/not a git repository/i.test(result.stderr)) return failure('not-a-repo');
	return failure('error');
}

async function readUncachedProjectGitStatusMap(
	projects: { id: string; path: string }[],
): Promise<Record<string, ProjectGitStatusMapEntry>> {
	const entries: Record<string, ProjectGitStatusMapEntry> = {};
	let nextIndex = 0;
	const workers = Array.from(
		{ length: Math.min(maxConcurrentStatusReads, projects.length) },
		async () => {
			while (nextIndex < projects.length) {
				const project = projects[nextIndex];
				nextIndex += 1;
				if (!project) continue;
				entries[project.id] = {
					id: project.id,
					path: project.path,
					status: await readProjectGitStatus(project.path),
				};
			}
		},
	);
	await Promise.all(workers);
	return entries;
}

export async function readProjectGitStatusMap(
	projects: { id: string; path: string }[],
	options: { cacheTtlMs?: number } = {},
): Promise<Record<string, ProjectGitStatusMapEntry>> {
	const key = JSON.stringify(projects.map(({ id, path }) => [id, path]));
	const now = Date.now();
	const cached = statusMapCache.get(key);
	if (cached && cached.expiresAt > now) return await cached.value;
	if (cached) statusMapCache.delete(key);
	const value = readUncachedProjectGitStatusMap(projects);
	const entry: StatusMapCacheEntry = { expiresAt: Number.POSITIVE_INFINITY, value };
	statusMapCache.set(key, entry);
	void value.then(
		() => {
			entry.expiresAt = Date.now() + (options.cacheTtlMs ?? statusMapCacheTtlMs);
		},
		() => statusMapCache.delete(key),
	);
	if (statusMapCache.size > maxStatusMapCacheEntries) {
		const oldest = statusMapCache.keys().next().value;
		if (oldest !== undefined) statusMapCache.delete(oldest);
	}
	try {
		return await value;
	} catch (err) {
		statusMapCache.delete(key);
		throw err;
	}
}

export function clearProjectGitStatusMapCache(): void {
	statusMapCache.clear();
}

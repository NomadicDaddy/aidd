import { statOrNull } from '../fsHelpers.ts';

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

interface GitOutput {
	exitCode: number;
	stderr: string;
	stdout: string;
	timedOut: boolean;
}

const commandTimeoutMs = 3_000;
const maxConcurrentStatusReads = 6;

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

async function runGitStatus(projectPath: string): Promise<GitOutput> {
	let subprocess: ReturnType<typeof Bun.spawn>;
	try {
		subprocess = Bun.spawn(
			['git', 'status', '--porcelain=v1', '--branch', '--untracked-files=all'],
			{
				cwd: projectPath,
				stderr: 'pipe',
				stdin: 'ignore',
				stdout: 'pipe',
				windowsHide: true,
			},
		);
	} catch (err) {
		const stderr = err instanceof Error ? err.message : String(err);
		return { exitCode: 1, stderr, stdout: '', timedOut: false };
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
		return { exitCode: 1, stderr: 'git status timed out', stdout: '', timedOut: true };
	}
	return { ...race, timedOut: false };
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
	if (result.exitCode === 0) return parsePorcelain(result.stdout);
	if (/not a git repository/i.test(result.stderr)) return failure('not-a-repo');
	return failure('error');
}

export async function readProjectGitStatusMap(
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

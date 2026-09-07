import { join } from 'node:path';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { statOrNull } from '../fsHelpers.ts';
import { countLines, languageForPath } from './repoLanguages.ts';

export type RepositoryInfoState = 'error' | 'not-a-repo' | 'ok' | 'project-missing';

export interface RepositoryAuthor {
	commits: number;
	email: string;
	name: string;
}

export interface RepositoryLanguage {
	bytes: number;
	files: number;
	language: string;
	lines: number;
}

export interface RepositoryLatestCommit {
	authorName: string;
	date: string;
	hash: string;
	subject: string;
}

export interface RepositoryInfo {
	authors: RepositoryAuthor[];
	currentBranch: string;
	dominantLanguage: null | string;
	languages: RepositoryLanguage[];
	latestCommit: null | RepositoryLatestCommit;
	localBranches: number;
	remoteBranches: number;
	sizeBytes: number;
	tags: number;
	totalFiles: number;
	totalLines: number;
	/** True when the line-of-code scan stopped early because it hit the time/file budget. */
	truncated: boolean;
}

export interface RepositoryInfoResult {
	info: null | RepositoryInfo;
	reason: null | string;
	state: RepositoryInfoState;
}

// The whole introspection is bounded so a huge repository never blocks the UI (the frontend shows
// a skeleton while pending and an EmptyState on failure). Each git command gets its own timeout and
// the working-tree scan stops at a wall-clock deadline, flagging the result as truncated.
const commandTimeoutMs = 5_000;
const scanDeadlineMs = 4_500;
const maxScanFiles = 50_000;
const maxReadableFileBytes = 4 * 1024 * 1024;
const maxAuthors = 8;
// ASCII unit separator: a delimiter that cannot appear in a commit hash, author, date, or subject.
const FIELD_SEP = '';
const LOG_FORMAT = `--format=%H${FIELD_SEP}%an${FIELD_SEP}%aI${FIELD_SEP}%s`;

interface GitOutput {
	ok: boolean;
	stderr: string;
	stdout: string;
	timedOut: boolean;
}

// Bun.spawn (never node:child_process) — on Windows the latter leaks the HTTP listen socket into
// the child and orphans the port. Argv array means no shell interpolation of the project path.
async function runGit(cwd: string, args: string[], timeoutMs: number): Promise<GitOutput> {
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
	const race = await Promise.race([settled, Bun.sleep(timeoutMs).then(() => 'timeout' as const)]);
	if (race === 'timeout') {
		subprocess.kill();
		return { ok: false, stderr: `git ${args[0]} timed out`, stdout: '', timedOut: true };
	}
	return { ok: race.exitCode === 0, stderr: race.stderr, stdout: race.stdout, timedOut: false };
}

function nonEmptyLines(text: string): string[] {
	return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

function parseAuthors(stdout: string): RepositoryAuthor[] {
	const authors: RepositoryAuthor[] = [];
	for (const line of nonEmptyLines(stdout)) {
		const match = /^\s*(\d+)\s+(.+?)\s+<([^>]*)>\s*$/.exec(line);
		if (!match) continue;
		authors.push({ commits: Number(match[1]), email: match[3] ?? '', name: match[2] ?? '' });
	}
	return authors.slice(0, maxAuthors);
}

function parseLatestCommit(stdout: string): null | RepositoryLatestCommit {
	const trimmed = stdout.trim();
	if (!trimmed) return null;
	const [hash, authorName, date, ...subjectParts] = trimmed.split(FIELD_SEP);
	if (!hash) return null;
	return {
		authorName: authorName ?? '',
		date: date ?? '',
		hash,
		subject: subjectParts.join(FIELD_SEP),
	};
}

interface ScanResult {
	dominantLanguage: null | string;
	languages: RepositoryLanguage[];
	sizeBytes: number;
	totalFiles: number;
	totalLines: number;
	truncated: boolean;
}

// Walk the git-tracked files (so .gitignore is honored and untracked build output is excluded).
// Source files are read once to count lines and bytes; everything else is sized via stat only, so
// a tree full of assets stays cheap. The deadline guards against pathologically large repositories.
async function scanWorkingTree(projectPath: string, paths: string[]): Promise<ScanResult> {
	const totals = new Map<string, RepositoryLanguage>();
	let sizeBytes = 0;
	let totalLines = 0;
	let truncated = paths.length > maxScanFiles;
	const files = truncated ? paths.slice(0, maxScanFiles) : paths;
	const startedAt = Date.now();
	let totalFiles = 0;
	for (const relPath of files) {
		if (Date.now() - startedAt > scanDeadlineMs) {
			truncated = true;
			break;
		}
		totalFiles += 1;
		const absolute = join(projectPath, relPath);
		const language = languageForPath(relPath);
		const stat = await statOrNull(absolute);
		if (!stat?.isFile()) continue;
		const size = stat.size;
		sizeBytes += size;
		if (language === null || size > maxReadableFileBytes) continue;
		let text: string;
		try {
			text = await Bun.file(absolute).text();
		} catch {
			continue;
		}
		const lines = countLines(text);
		totalLines += lines;
		const entry = totals.get(language) ?? { bytes: 0, files: 0, language, lines: 0 };
		entry.bytes += size;
		entry.files += 1;
		entry.lines += lines;
		totals.set(language, entry);
	}
	const languages = [...totals.values()].sort((a, b) => b.lines - a.lines || b.files - a.files);
	return {
		dominantLanguage: languages[0]?.language ?? null,
		languages,
		sizeBytes,
		totalFiles,
		totalLines,
		truncated,
	};
}

function failure(state: RepositoryInfoState, reason: string): RepositoryInfoResult {
	return { info: null, reason, state };
}

async function detectWorkTree(projectPath: string): Promise<null | RepositoryInfoResult> {
	const probe = await runGit(
		projectPath,
		['rev-parse', '--is-inside-work-tree'],
		commandTimeoutMs,
	);
	if (probe.ok && probe.stdout.trim() === 'true') return null;
	if (probe.timedOut) return failure('error', 'git timed out while inspecting the repository.');
	if (/not a git repository/i.test(probe.stderr)) {
		return failure('not-a-repo', 'The project directory is not a git repository.');
	}
	if (probe.stderr.trim() === '' && probe.stdout.trim() === '') {
		return failure('error', 'git is not available on this system.');
	}
	return failure('not-a-repo', 'The project directory is not a git repository.');
}

export async function readRepositoryInfo(projectPath: string): Promise<RepositoryInfoResult> {
	const dirStat = await statOrNull(projectPath);
	if (!dirStat?.isDirectory()) {
		return failure('project-missing', 'The project directory does not exist on disk.');
	}
	const notRepo = await detectWorkTree(projectPath);
	if (notRepo) return notRepo;

	const [branch, localBranches, remoteBranches, tags, authors, latest, tracked] =
		await Promise.all([
			runGit(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD'], commandTimeoutMs),
			runGit(projectPath, ['branch', '--list'], commandTimeoutMs),
			runGit(projectPath, ['branch', '-r'], commandTimeoutMs),
			runGit(projectPath, ['tag'], commandTimeoutMs),
			runGit(projectPath, ['shortlog', '-sne', 'HEAD'], commandTimeoutMs),
			runGit(projectPath, ['log', '-1', LOG_FORMAT], commandTimeoutMs),
			runGit(projectPath, ['ls-files', '-z'], commandTimeoutMs),
		]);

	const trackedPaths = tracked.ok
		? tracked.stdout.split('\0').filter((entry) => entry.length > 0)
		: [];
	const scan = await scanWorkingTree(projectPath, trackedPaths);

	const info: RepositoryInfo = {
		authors: parseAuthors(authors.stdout),
		currentBranch: branch.ok ? branch.stdout.trim() || 'HEAD' : 'HEAD',
		dominantLanguage: scan.dominantLanguage,
		languages: scan.languages,
		latestCommit: parseLatestCommit(latest.stdout),
		localBranches: localBranches.ok ? nonEmptyLines(localBranches.stdout).length : 0,
		remoteBranches: remoteBranches.ok
			? nonEmptyLines(remoteBranches.stdout).filter((line) => !line.includes('->')).length
			: 0,
		sizeBytes: scan.sizeBytes,
		tags: tags.ok ? nonEmptyLines(tags.stdout).length : 0,
		totalFiles: scan.totalFiles,
		totalLines: scan.totalLines,
		truncated: scan.truncated,
	};

	recordDataMovement({
		category: 'file',
		operation: 'project.repository-info.read',
		status: 'hit',
		summary: {
			files: info.totalFiles,
			language: info.dominantLanguage,
			truncated: info.truncated,
		},
		target: projectPath,
	});
	return { info, reason: null, state: 'ok' };
}

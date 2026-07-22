import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { removeTempTree } from '../lib/remove-temp-tree.ts';

// A parsed GitHub template source. cloneUrl is always constructed from the validated
// owner/repo pair — never the raw user input — so it is safe to place in a git argv.
export interface GithubTemplateSource {
	cloneUrl: string;
	owner: string;
	ref: null | string;
	repo: string;
}

export interface DegitOutcome {
	code: number;
	stderr: string;
	stdout: string;
}

export interface DegitGitResult {
	exitCode: number;
	missing: boolean;
	ok: boolean;
	stderr: string;
	stdout: string;
}

// Injectable so tests can fake git and the missing-git path stays testable.
export type DegitGitRunner = (args: string[], cwd: string) => Promise<DegitGitResult>;

const OWNER_PATTERN = /^[A-Za-z0-9-]+$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]+$/;
const REF_PATTERN = /^[A-Za-z0-9._/-]+$/;

// Accepts https://github.com/owner/repo, github.com/owner/repo, or owner/repo — each with an
// optional .git suffix, trailing slash, and #ref (branch/tag). Anything else (subdirectories,
// SSH URLs, other hosts) returns null; this parser is the single choke point for widening later.
export function parseGithubTemplateSource(input: string): GithubTemplateSource | null {
	const trimmed = input.trim();
	if (trimmed.length === 0) return null;

	const hashIndex = trimmed.indexOf('#');
	const ref = hashIndex === -1 ? null : trimmed.slice(hashIndex + 1);
	let path = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
	// A leading-dash ref could be read as a git option; reject rather than escape.
	if (ref !== null && (ref.length === 0 || !REF_PATTERN.test(ref) || ref.startsWith('-'))) {
		return null;
	}

	path = path.replace(/^https:\/\//i, '');
	if (/^github\.com\//i.test(path)) path = path.slice('github.com/'.length);
	path = path.replace(/\/+$/, '');

	const segments = path.split('/');
	if (segments.length !== 2) return null;
	const owner = segments[0] ?? '';
	let repo = segments[1] ?? '';
	if (repo.toLowerCase().endsWith('.git')) repo = repo.slice(0, -'.git'.length);
	if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) return null;
	if (repo === '.' || repo === '..') return null;

	return {
		cloneUrl: `https://github.com/${owner}/${repo}.git`,
		owner,
		ref,
		repo,
	};
}

async function spawnGit(args: string[], cwd: string): Promise<DegitGitResult> {
	try {
		const proc = Bun.spawn(['git', ...args], {
			cwd,
			stderr: 'pipe',
			stdin: 'ignore',
			stdout: 'pipe',
			windowsHide: true,
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		return { exitCode, missing: false, ok: exitCode === 0, stderr, stdout };
	} catch {
		// Bun.spawn throws (rather than exiting non-zero) when git is not on PATH; report it
		// as a missing binary so callers surface a clear failure instead of crashing.
		return { exitCode: -1, missing: true, ok: false, stderr: '', stdout: '' };
	}
}

// Clone a template repo with degit semantics: shallow clone, strip its .git, then git init a
// fresh history rooted at a single baseline commit of the imported tree (mirroring GitHub's
// "use this template", whose generated repo starts from an initial commit). Without that commit
// the entire cloned source sits untracked and the follow-up intake pipeline's .aidd-only commits
// become the project's root history. cloneUrl may be any git-clonable source — local paths work,
// which is how tests exercise this offline. Unlike the best-effort post-scaffold init, a missing
// git binary here is a hard failure: there is no project without the clone. Output from all
// steps is accumulated into one outcome so callers persist one log.
export async function degitClone(opts: {
	// Human-readable template name (usually the repo) woven into the baseline commit subject.
	baselineLabel?: string;
	cloneUrl: string;
	ref?: null | string;
	run?: DegitGitRunner;
	targetPath: string;
}): Promise<DegitOutcome> {
	const run = opts.run ?? spawnGit;
	const stdout: string[] = [];
	const stderr: string[] = [];

	const step = async (args: string[]): Promise<null | number> => {
		const result = await run(args, opts.targetPath);
		if (result.stdout) stdout.push(result.stdout);
		if (result.stderr) stderr.push(result.stderr);
		if (result.missing) {
			stderr.push('git executable not found on PATH');
			return -1;
		}
		return result.ok ? null : result.exitCode;
	};
	const outcome = (code: number): DegitOutcome => ({
		code,
		stderr: stderr.join('\n'),
		stdout: stdout.join('\n'),
	});

	await mkdir(opts.targetPath, { recursive: true });
	// Clone into '.' with cwd=targetPath so the target path never appears in the argv, and
	// pass the clone source after `--` so it can never be read as an option.
	const cloneArgs = ['clone', '--depth', '1'];
	if (opts.ref) cloneArgs.push('--branch', opts.ref);
	cloneArgs.push('--', opts.cloneUrl, '.');
	const cloneCode = await step(cloneArgs);
	if (cloneCode !== null) return outcome(cloneCode);

	await removeTempTree(join(opts.targetPath, '.git'));

	// Honor the user's git init.defaultBranch configuration instead of forcing a branch name.
	const initCode = await step(['init']);
	if (initCode !== null) return outcome(initCode);

	const addCode = await step(['add', '-A']);
	if (addCode !== null) return outcome(addCode);

	// A machine without a configured git identity must still get its baseline commit. Probe the
	// resolved config and supply a fallback only for the missing field(s), so a configured
	// identity is never overridden. The probes bypass step() — a non-zero exit here is the
	// expected "unset" signal, not failure output worth accumulating into the log.
	const identity: string[] = [];
	const nameProbe = await run(['config', 'user.name'], opts.targetPath);
	if (!nameProbe.ok || nameProbe.stdout.trim().length === 0) {
		identity.push('-c', 'user.name=aidd');
	}
	const emailProbe = await run(['config', 'user.email'], opts.targetPath);
	if (!emailProbe.ok || emailProbe.stdout.trim().length === 0) {
		identity.push('-c', 'user.email=aidd@localhost');
	}

	// --allow-empty keeps the root-commit invariant even for a degenerate empty template repo,
	// which git happily clones (with a warning) but would otherwise refuse to commit.
	const label = opts.baselineLabel ? `${opts.baselineLabel} ` : '';
	const commitCode = await step([
		...identity,
		'commit',
		'--allow-empty',
		'-m',
		`chore: import ${label}template baseline`,
	]);
	if (commitCode !== null) return outcome(commitCode);

	return outcome(0);
}

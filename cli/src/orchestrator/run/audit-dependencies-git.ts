import { spawnSync } from 'node:child_process';
import { createHash, type Hash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface AuditGitSnapshot {
	configSha256: string;
	hooksSha256: string;
}

interface HookInspection {
	bytes: number;
	deadlineAtMs: number;
	entries: number;
}

function checkHookInspection(budget: HookInspection, size: number): void {
	budget.entries++;
	budget.bytes += size;
	if (budget.entries > 4096 || budget.bytes > 16 * 1024 * 1024) {
		throw new Error('Git hook snapshot exceeds bounded inspection limits.');
	}
	if (Date.now() >= budget.deadlineAtMs)
		throw new Error('Audit setup deadline exhausted during Git inspection.');
}

function hashHooks(hash: Hash, root: string, budget: HookInspection, relative = ''): void {
	const file = join(root, relative);
	const info = lstatSync(file);
	checkHookInspection(budget, info.isFile() ? info.size : 0);
	hash.update(`${relative}\0${String(info.mode)}\0`);
	if (info.isSymbolicLink()) {
		hash.update(readlinkSync(file));
		return;
	}
	if (info.isFile()) {
		hash.update(readFileSync(file));
		return;
	}
	if (!info.isDirectory()) throw new Error('Unsupported Git hook entry during audit setup.');
	for (const name of readdirSync(file).sort())
		hashHooks(hash, root, budget, join(relative, name));
}

export function readSetupGit(directory: string, args: string[], deadlineAtMs: number): string {
	const remainingMs = deadlineAtMs - Date.now();
	if (remainingMs <= 0) throw new Error('Audit setup deadline exhausted before Git inspection.');
	const result = spawnSync('git', ['-C', directory, ...args], {
		encoding: 'utf8',
		maxBuffer: 1024 * 1024,
		timeout: remainingMs,
		windowsHide: true,
	});
	if (result.error || result.status !== 0)
		throw new Error('Git metadata inspection failed or exceeded its run deadline.');
	return result.stdout;
}

/** Only fingerprints are retained. Git config can contain credentials or private URLs; never
 * print or persist its raw values. Hook symlinks are fingerprinted without following them. */
export function snapshotAuditGit(directory: string, deadlineAtMs: number): AuditGitSnapshot {
	const config = readSetupGit(directory, ['config', '--local', '--list', '-z'], deadlineAtMs);
	const hooks = readSetupGit(directory, ['rev-parse', '--git-path', 'hooks'], deadlineAtMs);
	const hooksPath = resolve(directory, hooks.trim());
	const hookHash = createHash('sha256').update(`${hooksPath}\0`);
	if (existsSync(hooksPath))
		hashHooks(hookHash, hooksPath, { bytes: 0, deadlineAtMs, entries: 0 });
	else hookHash.update('missing');
	return {
		configSha256: createHash('sha256').update(config).digest('hex'),
		hooksSha256: hookHash.digest('hex'),
	};
}

export function assertAuditGitUnchanged(before: AuditGitSnapshot, after: AuditGitSnapshot): void {
	const changed: string[] = [];
	if (before.configSha256 !== after.configSha256) changed.push('local Git configuration');
	if (before.hooksSha256 !== after.hooksSha256) changed.push('effective Git hooks');
	if (changed.length > 0) {
		throw new Error(
			`[audit-integrity-violation] Shared Git metadata changed during setup: ${changed.join(', ')}`,
		);
	}
}

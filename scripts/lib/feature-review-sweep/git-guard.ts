import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { AIDD_SCRIPT } from './constants.ts';
import { type GitStatus, type ValidatorResult } from './types.ts';

let cachedBashPathStyle: 'gitbash' | 'wsl' | null = null;

export function getGitStatusPaths(repoRoot: string): GitStatus {
	const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
		cwd: repoRoot,
		encoding: 'utf8',
		windowsHide: true,
	});

	if (result.status !== 0) {
		return {
			ok: false,
			paths: [],
			raw: result.stdout || result.stderr || '',
		};
	}

	const paths: string[] = [];
	for (const line of result.stdout.split(/\r?\n/)) {
		if (!line.trim()) {
			continue;
		}
		const pathPart = line.slice(3).trim();
		const normalized = pathPart.includes(' -> ')
			? (pathPart.split(' -> ').at(-1) ?? pathPart)
			: pathPart;
		paths.push(normalized.replace(/\\/g, '/'));
	}

	return {
		ok: true,
		paths,
		raw: result.stdout,
	};
}

export function isAllowedAppMutation(relativePath: string): boolean {
	return (
		/^\.aidd\/features\/[^/]+\/feature\.json$/.test(relativePath) ||
		/^\.aidd\/reports\/.+/.test(relativePath)
	);
}

function detectBashPathStyle(): 'gitbash' | 'wsl' {
	if (cachedBashPathStyle) {
		return cachedBashPathStyle;
	}

	const result = spawnSync(
		'bash',
		[
			'-lc',
			'if [ -e /mnt/d ]; then echo wsl; elif [ -e /d ]; then echo gitbash; else echo unknown; fi',
		],
		{ encoding: 'utf8' }
	);

	if (result.error) {
		cachedBashPathStyle = 'gitbash';
		return cachedBashPathStyle;
	}

	const style = (result.stdout || '').trim();
	cachedBashPathStyle = style === 'wsl' ? 'wsl' : 'gitbash';
	return cachedBashPathStyle;
}

function toBashPath(windowsPath: string): string {
	const normalized = path.resolve(windowsPath).replace(/\\/g, '/');
	const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
	if (!match?.[1]) {
		return normalized;
	}
	const drive = match[1].toLowerCase();
	const rest = match[2] ?? '';
	return detectBashPathStyle() === 'wsl' ? `/mnt/${drive}/${rest}` : `/${drive}/${rest}`;
}

export function runValidator(appRoot: string): ValidatorResult {
	if (!fs.existsSync(AIDD_SCRIPT)) {
		return {
			ok: false,
			reason: `aidd script not found at ${AIDD_SCRIPT}`,
			skipped: true,
		};
	}

	const isTypescriptEntry = AIDD_SCRIPT.endsWith('.ts');
	const invocation = isTypescriptEntry
		? `bun "${toBashPath(AIDD_SCRIPT)}" --project-dir "${toBashPath(appRoot)}" --check-features`
		: `"${toBashPath(AIDD_SCRIPT)}" --project-dir "${toBashPath(appRoot)}" --check-features`;
	const result = spawnSync('bash', ['-lc', invocation], {
		encoding: 'utf8',
		maxBuffer: 10 * 1024 * 1024,
	});

	if (result.error) {
		return {
			ok: false,
			reason: `bash unavailable: ${result.error.message}`,
			skipped: true,
		};
	}

	return {
		ok: result.status === 0,
		skipped: false,
		status: result.status,
		stderr: result.stderr || '',
		stdout: result.stdout || '',
	};
}

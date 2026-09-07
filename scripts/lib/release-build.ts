import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ReleaseSource {
	clean: boolean;
	commit: string;
	tree: string;
}

export function releaseSource(root: string): ReleaseSource {
	const git = (...args: string[]): string =>
		execFileSync('git', args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			windowsHide: true,
		}).trim();
	return {
		clean: git('status', '--porcelain', '--untracked-files=normal') === '',
		commit: git('rev-parse', 'HEAD'),
		tree: git('rev-parse', 'HEAD^{tree}'),
	};
}

export function sha256(bytes: string | Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

export function releaseVersion(root: string): string {
	const value = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
		version?: unknown;
	};
	if (typeof value.version !== 'string' || !/^[\w.+-]+$/.test(value.version)) {
		throw new Error('Invalid package version for release capture.');
	}
	return value.version;
}

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface AiddRunProvenance {
	aiddDirty: boolean | null;
	aiddRevision: null | string;
	aiddVersion: null | string;
}

export interface AiddGitProbeResult {
	exitCode: number;
	stdout: string;
}

export type AiddGitProbe = (args: readonly string[], cwd: string) => Promise<AiddGitProbeResult>;

export const unknownAiddRunProvenance: AiddRunProvenance = {
	aiddDirty: null,
	aiddRevision: null,
	aiddVersion: null,
};

export function parseAiddRunProvenance(
	value: Record<string, unknown>,
): AiddRunProvenance | undefined {
	const { aiddDirty, aiddRevision, aiddVersion } = value;
	if (!(aiddDirty === undefined || aiddDirty === null || typeof aiddDirty === 'boolean')) {
		return undefined;
	}
	if (!(
		aiddRevision === undefined ||
		aiddRevision === null ||
		typeof aiddRevision === 'string'
	)) {
		return undefined;
	}
	if (!(aiddVersion === undefined || aiddVersion === null || typeof aiddVersion === 'string')) {
		return undefined;
	}
	return {
		aiddDirty: aiddDirty ?? null,
		aiddRevision: aiddRevision ?? null,
		aiddVersion: aiddVersion ?? null,
	};
}

async function defaultGitProbe(args: readonly string[], cwd: string): Promise<AiddGitProbeResult> {
	try {
		const child = Bun.spawn(['git', ...args], {
			cwd,
			stderr: 'ignore',
			stdout: 'pipe',
			windowsHide: true,
		});
		const [exitCode, stdout] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
		]);
		return { exitCode, stdout };
	} catch {
		return { exitCode: 1, stdout: '' };
	}
}

export async function readAiddVersion(rootDir: string): Promise<null | string> {
	try {
		const value = (await readFile(join(rootDir, 'VERSION'), 'utf8')).trim();
		return value.length > 0 ? value : null;
	} catch {
		return null;
	}
}

export async function resolveAiddRunProvenance(
	rootDir: string,
	gitProbe: AiddGitProbe = defaultGitProbe,
): Promise<AiddRunProvenance> {
	const aiddVersion = await readAiddVersion(rootDir);
	const revision = await gitProbe(['rev-parse', '--verify', 'HEAD'], rootDir);
	if (revision.exitCode !== 0) {
		return { ...unknownAiddRunProvenance, aiddVersion };
	}
	const aiddRevision = revision.stdout.trim();
	if (aiddRevision.length === 0) {
		return { ...unknownAiddRunProvenance, aiddVersion };
	}
	const status = await gitProbe(['status', '--porcelain', '--untracked-files=normal'], rootDir);
	return {
		aiddDirty: status.exitCode === 0 ? status.stdout.trim().length > 0 : null,
		aiddRevision,
		aiddVersion,
	};
}

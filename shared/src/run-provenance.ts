import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { compareCodepoints, type HashedMember, sha256Set, sha256Text } from './content-hash.ts';

export interface AiddRunProvenance {
	aiddDirty: boolean | null;
	aiddRevision: null | string;
	aiddVersion: null | string;
}

/**
 * The only declaration of the driver kind vocabulary. The runs table CHECK constraint
 * (backend/src/db/schema/runsTables.ts, ck_runs_driver_kind) lists the same values and a test
 * holds the two equal.
 */
export const aiddRunDriverKinds = ['audit', 'prompt', 'recipe-step', 'skill'] as const;

export type AiddRunDriverKind = (typeof aiddRunDriverKinds)[number];

export interface AiddRunDriver {
	driverId: null | string;
	driverKind: AiddRunDriverKind | null;
	driverSha256: null | string;
}

export const unknownAiddRunDriver: AiddRunDriver = {
	driverId: null,
	driverKind: null,
	driverSha256: null,
};

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

const aiddRunDriverKindSet = new Set<string>(aiddRunDriverKinds);
const sha256Pattern = /^[a-f0-9]{64}$/;

export function isAiddRunDriverKind(value: unknown): value is AiddRunDriverKind {
	return typeof value === 'string' && aiddRunDriverKindSet.has(value);
}

export function parseAiddRunDriver(value: Record<string, unknown>): AiddRunDriver | undefined {
	const { driverId, driverKind, driverSha256 } = value;
	if (!(driverKind === undefined || driverKind === null || typeof driverKind === 'string')) {
		return undefined;
	}
	if (typeof driverKind === 'string' && !isAiddRunDriverKind(driverKind)) return undefined;
	if (!(driverId === undefined || driverId === null || typeof driverId === 'string')) {
		return undefined;
	}
	if (!(
		driverSha256 === undefined ||
		driverSha256 === null ||
		typeof driverSha256 === 'string'
	)) {
		return undefined;
	}
	if (typeof driverSha256 === 'string' && !sha256Pattern.test(driverSha256)) return undefined;
	return {
		driverId: driverId ?? null,
		driverKind: (driverKind ?? null) as AiddRunDriverKind | null,
		driverSha256: driverSha256 ?? null,
	};
}

/** Batch identity: the audit names in code point order joined by `+`; empty when none was named. */
export function auditRunDriverId(auditNames: readonly string[]): string {
	return [...auditNames].sort(compareCodepoints).join('+');
}

/**
 * The hash evals/audits/attestation.json records per audit: the definition text after newline
 * normalization. A single-audit run records exactly this value as its driverSha256.
 */
export function auditDefinitionSha256(definition: string): string {
	return sha256Text(definition);
}

export interface AuditRunDriverResolution {
	driver: AiddRunDriver;
	/** Audits whose definition could not be read; driverSha256 is null whenever this is non-empty. */
	missingAudits: string[];
}

/**
 * The driver for an audit run: id from auditRunDriverId, hash from the audit definitions under
 * `<rootDir>/audits`. One audit hashes to its own definition so the value can be looked up in the
 * attestation directly; a batch hashes the set of (name, definition hash) pairs, so two batches
 * share a hash exactly when they ran the same audits at the same definitions.
 */
export async function resolveAuditRunDriver(
	rootDir: string,
	auditNames: readonly string[],
): Promise<AuditRunDriverResolution> {
	const names = [...auditNames].sort(compareCodepoints);
	const members: HashedMember[] = [];
	const missingAudits: string[] = [];
	for (const name of names) {
		try {
			const definition = await readFile(join(rootDir, 'audits', `${name}.md`), 'utf8');
			members.push({ id: name, sha256: auditDefinitionSha256(definition) });
		} catch {
			missingAudits.push(name);
		}
	}
	const complete = missingAudits.length === 0 && members.length > 0;
	const [single] = members;
	const driverSha256 = !complete
		? null
		: members.length === 1 && single
			? single.sha256
			: sha256Set(members);
	return {
		driver: { driverId: names.join('+'), driverKind: 'audit', driverSha256 },
		missingAudits,
	};
}

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

// node:child_process rather than Bun.spawn: this module also declares the driver types the
// frontend imports, so it must typecheck without the Bun global.
async function defaultGitProbe(args: readonly string[], cwd: string): Promise<AiddGitProbeResult> {
	return await new Promise((resolve) => {
		try {
			execFile('git', [...args], { cwd, windowsHide: true }, (error, stdout) => {
				if (error) {
					resolve({
						exitCode: typeof error.code === 'number' ? error.code : 1,
						stdout: '',
					});
					return;
				}
				resolve({ exitCode: 0, stdout: String(stdout) });
			});
		} catch {
			resolve({ exitCode: 1, stdout: '' });
		}
	});
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

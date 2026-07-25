import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { Feature } from '../metadata/features.ts';

import { filterApplicableAuditNames } from '../metadata/project-profile.ts';

export const simulationMarker = '<!-- aidd:simulated -->';
export const simulationSignaturePhrase = 'aidd v2 native backend is installed.';

export function isReferenceAudit(body: string): boolean {
	return /type:\s*['"]reference['"]/.test(body);
}

async function scanAuditDir(auditDir: string): Promise<string[]> {
	try {
		const entries = (await readdir(auditDir)).filter((entry) => entry.endsWith('.md')).sort();
		const names: string[] = [];
		for (const entry of entries) {
			const body = await readFile(join(auditDir, entry), 'utf8');
			if (isReferenceAudit(body)) continue;
			names.push(basename(entry, '.md'));
		}
		return names;
	} catch {
		return [];
	}
}

/**
 * Catalog audit-definition discovery. Scans `<rootDir>/audits/` for `.md`
 * audit definitions and excludes reference-type audits (which the audit runner
 * never selects). `rootDir` is the aidd install directory (the shipped audit
 * catalog), so this is used by the audit runner when selecting which audits to
 * run for a project.
 */
export async function discoverAuditNames(rootDir: string): Promise<string[]> {
	return scanAuditDir(join(rootDir, 'audits'));
}

/**
 * Project-scoped audit-definition discovery. Scans `<projectDir>/.aidd/audits/`
 * — the per-project audit set scaffolded by `copyAuditFiles` (see
 * `metadata/scaffold.ts`) — and excludes reference-type audits. Used by the
 * audit-maintenance / audit-health detectors, which receive a `projectDir`
 * (the target project) rather than the aidd catalog `rootDir`. A target
 * project has no top-level `audits/`; its selected audits live under
 * `.aidd/audits/`, which is exactly the set reports are generated for.
 */
export async function discoverProjectAuditNames(
	projectDir: string,
	options: { applyProfile?: boolean; catalogDir?: string } = {},
): Promise<string[]> {
	const names = await scanAuditDir(join(projectDir, '.aidd', 'audits'));
	if (!options.applyProfile) return names;
	if (!options.catalogDir) {
		throw new Error(
			'discoverProjectAuditNames: catalogDir is required when applyProfile is true',
		);
	}
	return await filterApplicableAuditNames(options.catalogDir, projectDir, names);
}

export interface AuditFindingInput {
	affectedFiles?: unknown;
	auditSeverity?: unknown;
	category?: unknown;
	description?: unknown;
	id?: unknown;
	severity?: unknown;
	spec?: unknown;
	title?: unknown;
}

export const auditInstrumentKinds = ['artifact', 'probe', 'script'] as const;

export type AuditInstrumentKind = (typeof auditInstrumentKinds)[number];

/**
 * A measurement instrument declaration that passed structural validation: every
 * descriptive field is a non-empty string, kind is recognized, and the agent
 * confirmed the instrument ran. The report writer cannot independently reproduce
 * that evidence; semantic Phase 0 verification remains the auditor's responsibility.
 */
export interface AuditInstrument {
	evidence: string;
	kind: AuditInstrumentKind;
	measured: string;
	name: string;
	target: string;
	verified: true;
}

export interface AuditReportInput {
	auditName: string;
	structured: Record<string, unknown>;
}

export interface InvalidAuditReport {
	auditName?: string;
	index: number;
	reason: string;
}

export interface NormalizedAuditFinding {
	duplicate: boolean;
	feature: Feature;
}

/**
 * A declared instrument that failed validation. `label` is the instrument's own
 * name when it supplied one and its positional slot otherwise, so a rejection can
 * always be named in the report that had its score withheld.
 */
export interface RejectedAuditInstrument {
	index: number;
	label: string;
	reasons: string[];
}

export function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function arrayOfStrings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

export function normalizeText(value: unknown): string {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

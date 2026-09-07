import {
	type AuditProfileOverrides,
	buildApplicabilityMatrix,
	isAuditApplicableToProfile,
	normalizeAuditProfileOverrides,
} from 'aidd-shared';
import {
	createAuditFreshnessContext,
	evaluateAuditReportFreshness,
} from 'aidd-shared/metadata/audit-freshness';
import {
	auditProfileOverridesPath,
	loadAuditProfileMapping,
	loadAuditProfileOverrides,
	writeAuditProfileOverrides,
} from 'aidd-shared/metadata/audit-profile-mapping';
import { readProjectAssuranceProfile } from 'aidd-shared/metadata/project-profile';
import { discoverAuditNames } from 'aidd-shared/modes/audit-shared';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';

import type { ProjectAuditEntryDto, ProjectAuditsDto } from './auditTypes.ts';

import { pathIsInside } from '../../paths.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';
import { normalizeAuditName, scoreAuditCatalog } from './auditHelpers.ts';

export async function saveProjectAuditOverridesImpl(
	projectId: string,
	input: unknown,
	resolveProject: (id: string) => Promise<string>,
	rootDir: string,
): Promise<AuditProfileOverrides> {
	const projectDir = await resolveProject(projectId);
	const target = auditProfileOverridesPath(projectDir);
	if (!pathIsInside(projectDir, target)) {
		throw new HttpError('Audit overrides path escapes the project directory.', 400);
	}
	const stamped = {
		...(input as Record<string, unknown>),
		updatedAt: new Date().toISOString(),
	};
	const normalized = normalizeAuditProfileOverrides(stamped);
	const auditNames = await discoverAuditNames(rootDir);
	const knownAudits = new Set(auditNames.map((name) => name.toUpperCase()));
	for (const audit of Object.keys(normalized.audits)) {
		if (!knownAudits.has(audit.toUpperCase())) {
			throw new HttpError(`Override references unknown audit: ${audit}`, 400);
		}
	}
	for (const rule of normalized.rules) {
		for (const audit of rule.audits) {
			if (audit === '*') continue;
			if (!knownAudits.has(audit.toUpperCase())) {
				throw new HttpError(
					`Override rule ${rule.id} references unknown audit: ${audit}`,
					400,
				);
			}
		}
	}
	const overrides = await writeAuditProfileOverrides(projectDir, normalized);
	recordDataMovement({
		category: 'metadata',
		operation: 'audit.profile-overrides.write',
		status: 'success',
		summary: {
			explicitCount: Object.keys(overrides.audits).length,
			projectId,
			ruleCount: overrides.rules.length,
		},
		target,
	});
	return overrides;
}

export async function listProjectAuditsImpl(
	projectId: string,
	resolveProject: (id: string) => Promise<string>,
	rootDir: string,
	auditsEnabled: boolean,
	auditPathFn: (name: string) => string,
	resolveScoringRoots: () => string[],
): Promise<ProjectAuditsDto> {
	const projectDir = await resolveProject(projectId);
	const [auditNames, mapping, profile, overrides] = await Promise.all([
		discoverAuditNames(rootDir),
		loadAuditProfileMapping(rootDir),
		readProjectAssuranceProfile(projectDir),
		loadAuditProfileOverrides(projectDir),
	]);
	const matrixRows = buildApplicabilityMatrix(auditNames, mapping);
	const matrixIndex = new Map(matrixRows.map((row) => [row.auditName.toUpperCase(), row]));
	const scoresByAudit = await scoreAuditCatalog(auditNames, rootDir, resolveScoringRoots);
	const explicitOverrides = overrides?.audits ?? {};
	const freshnessContext = createAuditFreshnessContext();
	const entries: ProjectAuditEntryDto[] = [];
	for (const name of auditNames) {
		const normalized = normalizeAuditName(name);
		const path = auditPathFn(normalized);
		const file = await stat(path).catch(() => null);
		const matrixRow = matrixIndex.get(normalized.toUpperCase());
		const appliesToBucket = matrixRow ? matrixRow.byBucket[profile.bucket].applies : true;
		const overrideEffectRaw =
			explicitOverrides[normalized] ?? explicitOverrides[normalized.toUpperCase()] ?? null;
		const overrideEffect =
			overrideEffectRaw === 'disabled' ||
			overrideEffectRaw === 'required' ||
			overrideEffectRaw === 'excluded'
				? overrideEffectRaw
				: null;
		const enabled = isAuditApplicableToProfile(profile, normalized, mapping, overrides);
		let freshReport = false;
		let staleReport = false;
		let missingReport = false;
		const freshness = await evaluateAuditReportFreshness(projectDir, normalized, {
			context: freshnessContext,
		});
		if (freshness.status === 'missing') {
			missingReport = true;
		} else if (freshness.status === 'stale') {
			staleReport = true;
		} else if (freshness.status === 'fresh') {
			freshReport = true;
		}
		const reportFreshness: ProjectAuditEntryDto['reportFreshness'] = {
			ageDays: freshness.ageDays,
			changes: freshness.changes,
			reasons: freshness.staleReasons,
			report: freshness.report,
		};
		const changePotential = scoresByAudit.get(normalized.toUpperCase());
		entries.push({
			appliesToBucket,
			...(changePotential ? { changePotential } : {}),
			enabled,
			freshReport,
			missingReport,
			name: normalized,
			overrideEffect,
			path,
			reportFreshness,
			staleReport,
			updatedAt: file ? file.mtime.toISOString() : null,
		});
	}
	return {
		auditsEnabled,
		bucket: profile.bucket,
		entries,
		projectId,
		projectName: basename(projectDir),
		projectPath: projectDir,
	};
}

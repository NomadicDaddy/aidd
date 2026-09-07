import type { AuditEvalCatalog, AuditEvalScoring, AuditEvalSite } from '../benchmark/types.ts';

import {
	booleanValue,
	numberValue,
	requireRecord,
	requireString,
	stringArray,
} from '../benchmark/validation.ts';

export const DEFAULT_LINE_TOLERANCE = 3;

export function requireUnitInterval(value: unknown, label: string): number {
	const parsed = numberValue(value);
	if (parsed === undefined || parsed < 0 || parsed > 1) {
		throw new Error(`${label} must be a number between 0 and 1`);
	}
	return parsed;
}

function optionalNonNegativeInteger(value: unknown, label: string, fallback: number): number {
	if (value === undefined) return fallback;
	const parsed = numberValue(value);
	if (parsed === undefined || !Number.isInteger(parsed) || parsed < 0) {
		throw new Error(`${label} must be a non-negative integer`);
	}
	return parsed;
}

/**
 * The scorer's knobs. The floors the attestation is held to live in evals/audits/floors.json, not
 * here, so lowering a floor is a diff on its own file rather than a line lost inside a regenerated
 * manifest.
 */
export function parseAuditEvalScoring(value: unknown): AuditEvalScoring | undefined {
	if (value === undefined) return undefined;
	const record = requireRecord(value, 'manifest.scoring.auditEval');
	for (const key of ['minPrecision', 'minRecall', 'minRuns']) {
		if (record[key] !== undefined) {
			throw new Error(
				`manifest.scoring.auditEval.${key} belongs in evals/audits/floors.json, not the manifest`,
			);
		}
	}
	const strictPrecision = booleanValue(record.strictPrecision);
	if (record.strictPrecision !== undefined && strictPrecision === undefined) {
		throw new Error('manifest.scoring.auditEval.strictPrecision must be a boolean');
	}
	const scoring = {
		lineTolerance: optionalNonNegativeInteger(
			record.lineTolerance,
			'manifest.scoring.auditEval.lineTolerance',
			DEFAULT_LINE_TOLERANCE,
		),
		precisionWeight: requireUnitInterval(
			record.precisionWeight,
			'manifest.scoring.auditEval.precisionWeight',
		),
		recallWeight: requireUnitInterval(
			record.recallWeight,
			'manifest.scoring.auditEval.recallWeight',
		),
		strictPrecision: strictPrecision ?? false,
	};
	if (scoring.precisionWeight + scoring.recallWeight === 0) {
		throw new Error('manifest.scoring.auditEval weights must not both be zero');
	}
	return scoring;
}

function parseSite(value: unknown, label: string, auditId: string): AuditEvalSite {
	const record = requireRecord(value, label);
	const aliases = stringArray(record.aliases)
		.map((alias) => alias.trim())
		.filter(Boolean);
	if (aliases.length === 0) throw new Error(`${label}.aliases must contain at least one string`);
	const siteAuditId = requireString(record, 'auditId', label);
	if (siteAuditId !== auditId) throw new Error(`${label}.auditId must equal ${auditId}`);
	const line = numberValue(record.line);
	const symbol = typeof record.symbol === 'string' ? record.symbol.trim() : '';
	if ((line === undefined) === (symbol.length === 0)) {
		throw new Error(`${label} must declare exactly one of line or symbol`);
	}
	if (line !== undefined && (!Number.isInteger(line) || line < 1)) {
		throw new Error(`${label}.line must be a positive integer`);
	}
	const site: AuditEvalSite = {
		aliases,
		auditId,
		file: requireString(record, 'file', label).replaceAll('\\', '/'),
		id: requireString(record, 'id', label),
		severity: requireString(record, 'severity', label),
	};
	if (line !== undefined) site.line = line;
	if (symbol) site.symbol = symbol;
	return site;
}

export function parseAuditEvalCatalog(
	value: unknown,
	label: string,
	scoring: AuditEvalScoring | undefined,
): AuditEvalCatalog {
	if (!scoring) throw new Error(`${label} requires manifest.scoring.auditEval`);
	const record = requireRecord(value, label);
	const auditId = requireString(record, 'auditId', label);
	const defectsRaw = Array.isArray(record.defects) ? record.defects : [];
	const decoysRaw = Array.isArray(record.decoys) ? record.decoys : [];
	if (defectsRaw.length === 0) throw new Error(`${label}.defects must not be empty`);
	if (decoysRaw.length === 0) throw new Error(`${label}.decoys must not be empty`);
	const defects = defectsRaw.map((entry, index) =>
		parseSite(entry, `${label}.defects[${index}]`, auditId),
	);
	const decoys = decoysRaw.map((entry, index) =>
		parseSite(entry, `${label}.decoys[${index}]`, auditId),
	);
	const ids = [...defects, ...decoys].map((site) => site.id);
	if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate site ids`);
	return { auditId, decoys, defects, scoring };
}

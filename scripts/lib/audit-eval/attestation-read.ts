import type { AuditEvalAttestation, AuditEvalAttestationRow } from './attestation.ts';

import { isRecord, numberValue, readJsonUnknown, stringValue } from '../benchmark/validation.ts';

function parseAttestationRow(value: unknown, index: number): AuditEvalAttestationRow {
	if (!isRecord(value)) throw new Error(`attestation.audits[${index}] must be an object`);
	const auditId = stringValue(value.auditId);
	const minPrecision = numberValue(value.minPrecision);
	const minRecall = numberValue(value.minRecall);
	const precision = numberValue(value.precision);
	const recall = numberValue(value.recall);
	const runs = numberValue(value.runs);
	if (
		!auditId ||
		minPrecision === undefined ||
		minRecall === undefined ||
		precision === undefined ||
		recall === undefined ||
		runs === undefined
	) {
		throw new Error(`attestation.audits[${index}] is incomplete`);
	}
	return {
		auditId,
		minPrecision,
		minRecall,
		// An attestation may lack these two; the checker reports the gap as a finding.
		minRuns: numberValue(value.minRuns) ?? 0,
		precision,
		recall,
		runs,
		uncatalogedFindings: numberValue(value.uncatalogedFindings) ?? 0,
	};
}

function hashMap(value: unknown, label: string): Record<string, string> {
	if (value === undefined) return {};
	if (!isRecord(value)) throw new Error(`attestation.${label} must be an object`);
	const hashes: Record<string, string> = {};
	for (const [key, hash] of Object.entries(value)) {
		if (typeof hash !== 'string')
			throw new Error(`attestation.${label} hash for ${key} is invalid`);
		hashes[key] = hash;
	}
	return hashes;
}

/**
 * Reads a committed attestation. Fields the writer always emits but a committed attestation
 * may lack (auditFiles, resultsDigest, minRuns) come back empty rather than throwing, so the gate
 * can name what is missing as a finding instead of refusing to run.
 */
export function readAttestation(filePath: string): AuditEvalAttestation {
	const value = readJsonUnknown(filePath);
	if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.audits)) {
		throw new Error('attestation must be a version 1 object with an audits array');
	}
	if (!isRecord(value.auditDefinitions))
		throw new Error('attestation.auditDefinitions is missing');
	const generatedAt = stringValue(value.generatedAt);
	const manifestHash = stringValue(value.manifestHash);
	if (!generatedAt || !manifestHash)
		throw new Error('attestation hashes or timestamp are missing');
	return {
		auditDefinitions: hashMap(value.auditDefinitions, 'auditDefinitions'),
		auditFiles: hashMap(value.auditFiles, 'auditFiles'),
		audits: value.audits.map(parseAttestationRow),
		generatedAt,
		manifestHash,
		resultsDigest: stringValue(value.resultsDigest) ?? '',
		version: 1,
	};
}

import path from 'node:path';

import type { BenchmarkManifest } from '../benchmark/types.ts';
import type { AuditEvalAttestation } from './attestation.ts';
import type { AuditEvalFloors } from './floors.ts';

import { hashAuditFiles, sha256AuditDefinitionFile } from './attestation.ts';

export interface AuditEvalFinding {
	line: number;
	message: string;
	path: string;
	rule: 'AUDIT_EVAL';
}

export function auditEvalFinding(pathName: string, message: string, line = 1): AuditEvalFinding {
	return { line, message, path: pathName.replaceAll('\\', '/'), rule: 'AUDIT_EVAL' };
}

const ATTESTATION = 'evals/audits/attestation.json';

/**
 * Holds each cataloged audit's attested row to the floors file, not to whatever floors the
 * attestation recorded for itself: a row generated under lower floors reads as stale, and a lowered
 * floors.json is a diff on that file alone.
 */
export function checkAttestedScores(
	manifest: BenchmarkManifest,
	attestation: AuditEvalAttestation,
	floors: AuditEvalFloors,
	findings: AuditEvalFinding[],
): number {
	const expected = new Set(
		manifest.tasks
			.map((task) => task.auditEval?.auditId)
			.filter((auditId): auditId is string => auditId !== undefined),
	);
	if (expected.size === 0) {
		findings.push(
			auditEvalFinding('evals/audits/manifest.json', 'manifest has no audit-eval tasks'),
		);
	}
	if (!attestation.resultsDigest) {
		findings.push(auditEvalFinding(ATTESTATION, 'attestation carries no resultsDigest'));
	}
	for (const auditId of expected) {
		const row = attestation.audits.find((entry) => entry.auditId === auditId);
		if (!row) {
			findings.push(auditEvalFinding(ATTESTATION, `${auditId} has no attested score`));
			continue;
		}
		if (row.runs < floors.minRuns) {
			findings.push(
				auditEvalFinding(
					ATTESTATION,
					`${auditId} has ${row.runs} run(s); floors require ${floors.minRuns}`,
				),
			);
		}
		if (
			row.minPrecision !== floors.minPrecision ||
			row.minRecall !== floors.minRecall ||
			row.minRuns !== floors.minRuns
		) {
			findings.push(auditEvalFinding(ATTESTATION, `${auditId} floors are stale`));
		}
		if (row.precision < floors.minPrecision) {
			findings.push(
				auditEvalFinding(
					ATTESTATION,
					`${auditId} precision ${row.precision.toFixed(4)} is below ${floors.minPrecision}`,
				),
			);
		}
		if (row.recall < floors.minRecall) {
			findings.push(
				auditEvalFinding(
					ATTESTATION,
					`${auditId} recall ${row.recall.toFixed(4)} is below ${floors.minRecall}`,
				),
			);
		}
	}
	for (const row of attestation.audits) {
		if (!expected.has(row.auditId)) {
			findings.push(auditEvalFinding(ATTESTATION, `${row.auditId} is no longer evaluated`));
		}
	}
	return expected.size;
}

/**
 * Every file under audits/ is hash-gated, not only the runnable definitions: the methodology,
 * severity, and profile-mapping files shape every audit run just as much as a definition does.
 * Returns the number of files on disk that were checked.
 */
export function checkAuditFileHashes(
	root: string,
	runnableNames: string[],
	attestation: AuditEvalAttestation,
	findings: AuditEvalFinding[],
): number {
	for (const auditId of runnableNames) {
		const actual = sha256AuditDefinitionFile(path.join(root, 'audits', `${auditId}.md`));
		if (attestation.auditDefinitions[auditId] !== actual) {
			findings.push(
				auditEvalFinding(`audits/${auditId}.md`, 'audit definition hash is stale'),
			);
		}
	}
	const runnable = new Set(runnableNames);
	for (const auditId of Object.keys(attestation.auditDefinitions)) {
		if (!runnable.has(auditId)) {
			findings.push(auditEvalFinding(ATTESTATION, `${auditId} is not runnable`));
		}
	}
	const actualFiles = hashAuditFiles(root);
	if (Object.keys(attestation.auditFiles).length === 0) {
		findings.push(auditEvalFinding(ATTESTATION, 'attestation carries no auditFiles hashes'));
	}
	for (const [relative, hash] of Object.entries(actualFiles)) {
		const attested = attestation.auditFiles[relative];
		if (attested === undefined) {
			if (Object.keys(attestation.auditFiles).length > 0) {
				findings.push(auditEvalFinding(`audits/${relative}`, 'audit file is not attested'));
			}
		} else if (attested !== hash) {
			findings.push(auditEvalFinding(`audits/${relative}`, 'audit file hash is stale'));
		}
	}
	for (const relative of Object.keys(attestation.auditFiles)) {
		if (!(relative in actualFiles)) {
			findings.push(auditEvalFinding(ATTESTATION, `audits/${relative} no longer exists`));
		}
	}
	return Object.keys(actualFiles).length;
}

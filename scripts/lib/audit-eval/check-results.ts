import { existsSync } from 'node:fs';
import path from 'node:path';

import type { BenchmarkManifest } from '../benchmark/types.ts';
import type { AuditEvalAttestation } from './attestation.ts';
import type { AuditEvalFinding } from './check-scores.ts';

import { loadRuns } from '../benchmark/results.ts';
import { buildAuditEvalAttestation, selectAttestedRuns } from './attestation.ts';
import { auditEvalFinding } from './check-scores.ts';

const ATTESTATION = 'evals/audits/attestation.json';

/**
 * Rebuilds the attestation from the local run ledger and compares it with the committed one.
 *
 * The other checks only confirm the attestation's numbers clear the floors, so a hand-edited
 * precision or recall passed as long as it was high enough. evals/audits/results/ is gitignored, so
 * this runs only where the evals were run; in CI and a fresh clone it reports that it could not.
 */
export async function checkAttestedResults(input: {
	attestation: AuditEvalAttestation;
	findings: AuditEvalFinding[];
	floorsPath: string;
	manifest: BenchmarkManifest;
	manifestPath: string;
	root: string;
}): Promise<boolean> {
	const runsPath = path.join(input.root, 'evals', 'audits', 'results', 'runs.jsonl');
	if (!existsSync(runsPath)) return false;
	const { selected } = selectAttestedRuns(input.manifestPath, input.manifest, loadRuns(runsPath));
	const rebuilt = await buildAuditEvalAttestation(input.root, {
		floorsPath: input.floorsPath,
		manifestPath: input.manifestPath,
		runs: selected,
	});
	if (rebuilt.resultsDigest !== input.attestation.resultsDigest) {
		input.findings.push(
			auditEvalFinding(
				ATTESTATION,
				'resultsDigest does not match evals/audits/results/runs.jsonl; regenerate the attestation',
			),
		);
	}
	for (const row of input.attestation.audits) {
		const measured = rebuilt.audits.find((entry) => entry.auditId === row.auditId);
		if (
			!measured ||
			measured.precision !== row.precision ||
			measured.recall !== row.recall ||
			measured.runs !== row.runs
		) {
			input.findings.push(
				auditEvalFinding(
					ATTESTATION,
					`${row.auditId} attested scores differ from evals/audits/results/runs.jsonl`,
				),
			);
		}
	}
	return true;
}

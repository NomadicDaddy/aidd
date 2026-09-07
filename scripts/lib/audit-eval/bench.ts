import path from 'node:path';

import { writeAuditEvalAttestation } from './attestation.ts';

const WRITE_FAILING_FLAG = '--write-failing';

/**
 * Runs the audit-eval benchmark and refreshes the committed attestation. A below-floor result is
 * reported but not written unless --write-failing is given, so the attestation on disk is always
 * one that passed at the time it was recorded.
 */
export async function runAuditEvalBenchmark(
	root: string,
	forwardedArgs: string[],
): Promise<number> {
	const writeFailing = forwardedArgs.includes(WRITE_FAILING_FLAG);
	const benchmarkArgs = forwardedArgs.filter((arg) => arg !== WRITE_FAILING_FLAG);
	const manifestPath = path.join(root, 'evals', 'audits', 'manifest.json');
	const resultsDir = path.join(root, 'evals', 'audits', 'results');
	const workspacesDir = path.join(root, 'evals', 'audits', 'workspaces');
	const command = [
		'bun',
		'scripts/run-benchmark.ts',
		'--manifest',
		manifestPath,
		'--results-dir',
		resultsDir,
		'--workspaces-dir',
		workspacesDir,
		'--skip-preflight',
		...benchmarkArgs,
	];
	const run = Bun.spawnSync(command, { cwd: root, stderr: 'inherit', stdout: 'inherit' });
	if (run.exitCode !== 0) return run.exitCode;
	if (benchmarkArgs.includes('--dry-run')) return 0;
	const result = await writeAuditEvalAttestation(root, {
		attestationPath: path.join(root, 'evals', 'audits', 'attestation.json'),
		floorsPath: path.join(root, 'evals', 'audits', 'floors.json'),
		manifestPath,
		resultsDir,
		writeFailing,
	});
	for (const row of result.attestation.audits) {
		console.log(
			`[audit-eval] ${row.auditId}: precision ${row.precision.toFixed(4)}, recall ${row.recall.toFixed(4)}, runs ${row.runs} (need ${row.minRuns}), uncataloged findings ${row.uncatalogedFindings}`,
		);
	}
	if (result.skippedStale > 0) {
		console.log(
			`[audit-eval] ${result.skippedStale} run(s) from an earlier fixture were not attested`,
		);
	}
	if (result.passes) {
		console.log('[OK] audit-eval attestation written; floors pass');
		return 0;
	}
	console.log(
		result.written
			? '[FAIL] audit-eval floors not met; attestation written because --write-failing was given'
			: '[FAIL] audit-eval floors not met; attestation left unchanged (pass --write-failing to record it)',
	);
	return 1;
}

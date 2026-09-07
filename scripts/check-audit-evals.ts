#!/usr/bin/env bun
import path from 'node:path';
/**
 * Validates the planted-defect audit catalog and its measured attestation.
 *
 * Enforces: QUAL-001 (aidd) / QUAL-006 (aidd) -- audit definitions cannot pass smoke:qc with a
 * stale or below-floor eval attestation, and this gate follows the shared executable contract.
 */
import { cwd, exit } from 'node:process';
import { parseArgs } from 'node:util';

import { inspectAuditEvals } from './lib/audit-eval/check.ts';

export async function runAuditEvalCheck(root: string, json = false): Promise<number> {
	try {
		const result = await inspectAuditEvals(path.resolve(root));
		const envelope = {
			examined: result.examined,
			findings: result.findings,
			gate: result.gate,
			status: result.status,
		};
		if (json) console.log(JSON.stringify(envelope));
		else if (result.findings.length > 0) {
			for (const item of result.findings) {
				console.error(`- ${item.path}:${item.line} ${item.message}`);
			}
			console.log(
				`[FAIL] check:audit-evals -- ${result.findings.length} finding(s); ${result.measuredAudits} of ${result.measuredAudits + result.unmeasuredAudits} audits measured, ${result.hashedFiles} audit files hash-checked, ${result.examined} items examined.`,
			);
		} else {
			console.log(
				`[OK] check:audit-evals -- ${result.measuredAudits} of ${result.measuredAudits + result.unmeasuredAudits} audits measured, ${result.hashedFiles} audit files hash-checked, ${result.examined} items examined; attestation is current and above its floors.`,
			);
		}
		return result.status === 'pass' ? 0 : 1;
	} catch (err) {
		console.error(
			`[FAIL] check:audit-evals could not run: ${err instanceof Error ? err.message : String(err)}`,
		);
		return 2;
	}
}

if (import.meta.main) {
	let json = false;
	let root = cwd();
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			options: {
				json: { type: 'boolean' },
				root: { type: 'string' },
			},
			strict: true,
		});
		json = values.json ?? false;
		root = values.root ?? root;
	} catch (err) {
		console.error(`[FAIL] check:audit-evals: ${(err as Error).message}`);
		console.error('Usage: check:audit-evals [--root <dir>] [--json]');
		exit(2);
	}
	exit(await runAuditEvalCheck(root, json));
}

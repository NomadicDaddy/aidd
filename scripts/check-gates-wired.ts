#!/usr/bin/env bun
/**
 * Require every `test:*` script in `package.json` to be run by a `smoke:qc` step.
 *
 * Enforces: no regression test exists as a package script that nothing runs. No assertion ID; this
 * is a wiring invariant rather than a catalog rule.
 *
 * A test script that passes when someone runs it by hand reads as a gate and is not one.
 * `test:credential-disclosure`, the regression test for the gate that decides whether a credential
 * reached a model provider, sat in `package.json` with no step behind it until 2026-09-30. Deeper
 * had six of the same and Spernakit three, two of which had rotted into failing unseen.
 *
 * A script that cannot be a qc step is excused below, by name and with a reason. An excuse for a
 * script that no longer exists, or for one a step now runs, fails: otherwise each rename widens
 * the list while the check still prints OK. A step runs a script only when it names it exactly,
 * so `test:api-types` does not wire a `test:api`.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cwd, exit } from 'node:process';
import { parseArgs } from 'node:util';

import { SMOKE_QC_STEPS } from './lib/smoke-qc/steps.ts';

/** Scripts deliberately outside `smoke:qc`, each with the reason it cannot be a step. */
const EXCUSED: Record<string, string> = {};

export interface GatesWiredResult {
	code: number;
	examined: number;
	findings: string[];
}

export function findUnwiredGates(
	scripts: string[],
	wired: ReadonlySet<string>,
	excused: Record<string, string>,
): string[] {
	const gates = scripts.filter((name) => name.startsWith('test:'));
	const findings: string[] = [];
	// A manifest with no test scripts at all is a wrong directory, not a clean result.
	if (gates.length === 0) findings.push('package.json defines no test:* script to examine.');
	for (const [name, reason] of Object.entries(excused)) {
		if (reason.trim() === '') {
			findings.push(`${name} is excused without a reason. Say why no qc step can run it.`);
		}
		if (!gates.includes(name)) {
			findings.push(`${name} is excused but is not a script. Remove the excuse.`);
		} else if (wired.has(name)) {
			findings.push(`${name} is excused but a qc step runs it. Remove the excuse.`);
		}
	}
	for (const gate of gates) {
		if (wired.has(gate) || gate in excused) continue;
		findings.push(
			`${gate} is run by no smoke:qc step. Add a step in scripts/lib/smoke-qc, or excuse it in scripts/check-gates-wired.ts with a reason.`,
		);
	}
	return findings;
}

export function runGatesWiredCheck(projectRoot = cwd()): GatesWiredResult {
	const manifest: unknown = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
	const scripts =
		typeof manifest === 'object' && manifest !== null && 'scripts' in manifest
			? manifest.scripts
			: undefined;
	const names = typeof scripts === 'object' && scripts !== null ? Object.keys(scripts) : [];
	const wired = new Set<string>();
	for (const step of SMOKE_QC_STEPS) {
		const [runner, verb, name] = step.command;
		if (runner === 'bun' && verb === 'run' && name !== undefined) wired.add(name);
	}
	const findings = findUnwiredGates(names, wired, EXCUSED);
	const examined = names.filter((name) => name.startsWith('test:')).length;
	return { code: findings.length === 0 ? 0 : 1, examined, findings };
}

if (import.meta.main) {
	// A bad argument exits 2, so a mistyped flag is never read as an unwired gate.
	let projectRoot: string;
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			options: { 'project-dir': { type: 'string' } },
			strict: true,
		});
		projectRoot = resolve(values['project-dir'] ?? cwd());
	} catch (err) {
		console.error(`[FAIL] check:gates-wired: ${err instanceof Error ? err.message : ''}`);
		exit(2);
	}
	const result = runGatesWiredCheck(projectRoot);
	if (result.code === 0) {
		console.log(
			`[OK] check:gates-wired -- all ${String(result.examined)} test:* script(s) are run by a smoke:qc step or excused with a reason.`,
		);
	} else {
		for (const finding of result.findings) {
			console.error(`[FAIL] check:gates-wired: ${finding}`);
		}
	}
	exit(result.code);
}

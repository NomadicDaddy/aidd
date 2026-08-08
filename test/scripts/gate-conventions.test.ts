import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { collectGateConventions, readAssertionIds } from '../../scripts/check-gate-conventions.ts';
import { applyAllowlist, parseAllowlist } from '../../scripts/lib/gate/allowlist.ts';
import { discoverGates, staleDeclarations } from '../../scripts/lib/gate/discover.ts';
import { checkGate } from '../../scripts/lib/gate/rules.ts';
import { scanTopLevel } from '../../scripts/lib/gate/toplevel.ts';
import { type Gate, RULE_TITLES, STATIC_RULES } from '../../scripts/lib/gate/types.ts';

import { testTempDir } from '../_helpers/temp.ts';

// scripts/test-gate-conventions.ts drives the same rules through the real command against a
// scratch project, which is the shape spernakit can run as well since it has no test runner.
// This file covers what a subprocess fixture cannot reach cheaply: the rule functions in
// isolation, over sources written to provoke exactly one rule at a time.

function gate(source: string, path = 'scripts/check-fixture.ts'): Gate {
	return { path, source, tasks: ['check:fixture'] };
}

/** Satisfies every statically decidable rule, so a finding against it is the rule misfiring. */
const CONFORMING = [
	'#!/usr/bin/env bun',
	'/**',
	' * Enforces: QUAL-006 -- the fixture rule.',
	' */',
	"import { exit } from 'node:process';",
	"import { parseArgs } from 'node:util';",
	'',
	'export function runFixture(): number {',
	"\tconsole.log('[OK] fixture -- 1 item examined.');",
	'\treturn 0;',
	'}',
	'',
	'if (import.meta.main) {',
	'\tparseArgs({ args: Bun.argv.slice(2), options: {}, strict: true });',
	'\texit(runFixture());',
	'}',
	'',
].join('\n');

describe('gate conventions rules', () => {
	test('a conforming gate produces no findings', () => {
		expect(checkGate(gate(CONFORMING), new Set(['QUAL-006']))).toEqual([]);
	});

	test('GC1 reports the three ways a gate becomes unimportable', () => {
		const source = [
			"console.log('[OK] x');",
			'export const value = await Promise.resolve(1);',
		].join('\n');
		const findings = checkGate(gate(source), new Set()).filter((item) => item.rule === 'GC1');
		expect(findings.map((item) => item.message)).toEqual([
			'exports no `run*` function, so nothing can invoke the gate except spawning it',
			'has no `if (import.meta.main)` guard, so importing it runs it',
			"runs at import time: `console.log('[OK] x');`",
			'runs at import time: `export const value = await Promise.resolve(1);`',
		]);
	});

	test('GC2 accepts 0, 1 and 2 and rejects anything else', () => {
		const source = CONFORMING.replace('return 0;', 'if (Bun.env.X) exit(3);\n\treturn 0;');
		const findings = checkGate(gate(source), new Set()).filter((item) => item.rule === 'GC2');
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('exits 3');
		expect(checkGate(gate(CONFORMING), new Set()).some((item) => item.rule === 'GC2')).toBe(
			false,
		);
	});

	test('GC3 wants a status marker and no pictographs anywhere in the file', () => {
		const noMarker = checkGate(gate(CONFORMING.replace('[OK] ', '')), new Set());
		expect(noMarker.map((item) => item.rule)).toEqual(['GC3']);

		// Built from its code point so this file does not itself carry the character it tests for,
		// the same reason scripts/test-gate-conventions.ts writes its fixture as an escape.
		const check = String.fromCodePoint(0x2705);
		const escaped = checkGate(gate(CONFORMING.replace('[OK]', '[OK] \\u2705')), new Set());
		expect(escaped).toEqual([]);
		const literal = checkGate(gate(CONFORMING.replace('[OK]', `[OK] ${check}`)), new Set());
		expect(literal.map((item) => item.message)).toEqual([
			'carries a pictograph; use a status marker',
		]);
	});

	test('GC4 rejects hand-read argv and a parseArgs call without strict', () => {
		const byHand = CONFORMING.replace(
			'\tparseArgs({ args: Bun.argv.slice(2), options: {}, strict: true });',
			'\tconst target = process.argv[2];',
		);
		expect(checkGate(gate(byHand), new Set()).map((item) => item.message)).toEqual([
			'reads `argv` by hand; use `parseArgs({ strict: true })` from `node:util`',
		]);

		const loose = CONFORMING.replace(', strict: true', '');
		expect(checkGate(gate(loose), new Set()).map((item) => item.message)).toEqual([
			'calls `parseArgs` without an explicit `strict: true`',
		]);
	});

	test('GC6 needs an Enforces line, and one cited ID that resolves', () => {
		const unlinked = CONFORMING.replace(
			' * Enforces: QUAL-006 -- the fixture rule.',
			' * A gate.',
		);
		expect(checkGate(gate(unlinked), new Set(['QUAL-006'])).map((item) => item.rule)).toEqual([
			'GC6',
		]);

		// A synced gate cites the ID each repository files it under; requiring all of them to
		// resolve would leave a shared gate unable to cite anything.
		const bothRepos = CONFORMING.replace('QUAL-006 --', 'QUAL-006, ASSERT-050 --');
		expect(checkGate(gate(bothRepos), new Set(['ASSERT-050']))).toEqual([]);
		expect(
			checkGate(gate(bothRepos), new Set(['SEC-001'])).map((item) => item.message),
		).toEqual(['cites QUAL-006, ASSERT-050; none of them is in .aidd/assertions.md']);

		// An unreadable catalog leaves the Enforces line required and the citation unverified.
		expect(checkGate(gate(bothRepos), new Set())).toEqual([]);
	});

	test('GC8 only applies to a gate that offers --json', () => {
		expect(checkGate(gate(CONFORMING), new Set())).toEqual([]);
		const offers = `${CONFORMING}// Usage: check:fixture [--json]\n`;
		const findings = checkGate(gate(offers), new Set()).filter((item) => item.rule === 'GC8');
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toBe(
			'offers --json but its envelope is missing examined, findings, gate, status',
		);
	});

	// GC5 joined the list when rule 5's count half was given a static form; GC7 has none, and
	// rule 5's zero-items half remains a review item. The assertion is here so a rule cannot be
	// added to the checker without someone deciding it is genuinely decidable from the text.
	test('every static rule has a title, and the list stays the sparse seven', () => {
		expect(STATIC_RULES).toEqual(['GC1', 'GC2', 'GC3', 'GC4', 'GC5', 'GC6', 'GC8']);
		for (const rule of STATIC_RULES) expect(RULE_TITLES[rule]).toBeTruthy();
	});
});

describe('gate conventions top-level scanner', () => {
	test('masks comments, strings, templates and regex literals when counting braces', () => {
		const source = [
			'const pattern = /[`{]/;', // the backtick that used to open a template forever
			"const text = '} {';",
			'/* } */',
			'// {',
			'const tpl = `${1} }`;',
			"console.log('[OK]');",
		].join('\n');
		const scan = scanTopLevel(source);
		expect(scan.hasGuard).toBe(false);
		expect(scan.sideEffects.map((effect) => effect.line)).toEqual([6]);
	});
});

describe('gate conventions discovery', () => {
	test('follows composite tasks and ignores non-check tasks', () => {
		const discovered = discoverGates(
			JSON.stringify({
				scripts: {
					build: 'bun scripts/build.ts',
					'check:licenses':
						'bun run check:license-core && bun scripts/generate-licenses.ts --check',
					'check:license-core': 'bun scripts/check-license-core.ts',
					'check:shell': 'bun ./scripts/run-bash.ts scripts/check-leak-guard.sh',
				},
			}),
		);
		expect(discovered).toEqual([
			{
				path: 'scripts/check-license-core.ts',
				tasks: ['check:license-core', 'check:licenses'],
			},
			{ path: 'scripts/generate-licenses.ts', tasks: ['check:licenses'] },
			{ path: 'scripts/run-bash.ts', tasks: ['check:shell'] },
		]);
	});

	test('a manifest with no scripts object is an error, not an empty population', () => {
		expect(() => discoverGates('{"name":"x"}')).toThrow('no "scripts" object');
	});

	// A gate is declared by the `check*` name or by the allowlist's `gates` map. Without the
	// second half the population is whatever the naming convention happened to catch, which is
	// rule 5's own defect one level up: a true count over the wrong population.
	test('a declared task enters the population under a name the convention never matches', () => {
		const manifest = JSON.stringify({
			scripts: {
				build: 'bun scripts/build.ts',
				'verify-minification': 'bun scripts/verify-minification.ts',
			},
		});
		expect(discoverGates(manifest)).toEqual([]);
		expect(discoverGates(manifest, ['verify-minification'])).toEqual([
			{ path: 'scripts/verify-minification.ts', tasks: ['verify-minification'] },
		]);
	});

	test('a declaration that has stopped describing anything is itself a finding', () => {
		const manifest = JSON.stringify({
			scripts: {
				'check:licenses': 'bun scripts/check-licenses.ts',
				'lint:config': 'bunx eslint eslint.config.js',
				'verify-minification': 'bun scripts/verify-minification.ts',
			},
		});
		expect(staleDeclarations(manifest, ['verify-minification'])).toEqual([]);
		expect(staleDeclarations(manifest, ['verify-nothing'])[0]).toContain('no such task');
		expect(staleDeclarations(manifest, ['check:licenses'])[0]).toContain(
			'already matches the check* convention',
		);
		expect(staleDeclarations(manifest, ['lint:config'])[0]).toContain(
			'runs no TypeScript file',
		);
	});
});

describe('gate conventions allowlist', () => {
	const findings = [
		{ line: 1, message: 'no guard', path: 'scripts/check-a.ts', rule: 'GC1' as const },
		{ line: 2, message: 'no marker', path: 'scripts/check-a.ts', rule: 'GC3' as const },
	];
	const gates = [gate('', 'scripts/check-a.ts')];

	test('rejects a waiver with no reason, no paths, or an unknown rule', () => {
		expect(() => parseAllowlist('{"waivers":{"GC1":{"paths":["a"]}}}')).toThrow(
			'has no reason',
		);
		expect(() => parseAllowlist('{"waivers":{"GC1":{"paths":[],"reason":"x"}}}')).toThrow(
			'names no paths',
		);
		expect(() => parseAllowlist('{"waivers":{"GC9":{"paths":["a"],"reason":"x"}}}')).toThrow(
			'unknown rule GC9',
		);
		expect(() => parseAllowlist('{"excluded":{"a":"  "}}')).toThrow('has no reason');
	});

	test('suppresses exactly what it names', () => {
		const allowlist = parseAllowlist(
			JSON.stringify({ waivers: { GC1: { paths: ['scripts/check-a.ts'], reason: 'debt' } } }),
		);
		const applied = applyAllowlist(
			allowlist,
			gates,
			findings,
			new Set(['scripts/check-a.ts']),
			'allowlist.json',
		);
		expect(applied.suppressed.map((item) => item.rule)).toEqual(['GC1']);
		expect(applied.surviving.map((item) => item.rule)).toEqual(['GC3']);
	});

	test('a waiver whose rule now passes is itself a finding, so the list can only shrink', () => {
		const allowlist = parseAllowlist(
			JSON.stringify({ waivers: { GC2: { paths: ['scripts/check-a.ts'], reason: 'debt' } } }),
		);
		const applied = applyAllowlist(
			allowlist,
			gates,
			findings,
			new Set(['scripts/check-a.ts']),
			'allowlist.json',
		);
		expect(applied.surviving.some((item) => item.message.includes('now passes GC2'))).toBe(
			true,
		);
	});
});

describe('gate conventions report', () => {
	async function fixtureRoot(
		scripts: Record<string, string>,
		files: [string, string][],
		allowlist?: Record<string, unknown>,
	): Promise<string> {
		const root = await testTempDir('aidd-gate-conventions-');
		await mkdir(join(root, 'scripts'), { recursive: true });
		await writeFile(join(root, 'package.json'), `${JSON.stringify({ scripts })}\n`);
		if (allowlist !== undefined) {
			await writeFile(
				join(root, 'scripts/gate-conventions-allowlist.json'),
				`${JSON.stringify(allowlist)}\n`,
			);
		}
		for (const [path, content] of files) await writeFile(join(root, path), content);
		return root;
	}

	test('reports a pass with the count it examined', async () => {
		const root = await fixtureRoot({ 'check:fixture': 'bun scripts/check-fixture.ts' }, [
			['scripts/check-fixture.ts', CONFORMING],
		]);
		const report = await collectGateConventions(root);
		expect(report).toEqual({
			declared: 0,
			examined: 1,
			findings: [],
			gate: 'check:gate-conventions',
			status: 'pass',
			waived: [],
		});
	});

	// The count in the success line has to move with the population, or widening the population
	// reintroduces the vacuity the widening was meant to close.
	test('a declared gate is examined and counted separately from the convention', async () => {
		const root = await fixtureRoot(
			{ 'verify-fixture': 'bun scripts/verify-fixture.ts' },
			[['scripts/verify-fixture.ts', CONFORMING]],
			{ gates: { 'verify-fixture': 'A gate under a different verb, for this fixture.' } },
		);
		const report = await collectGateConventions(root);
		expect(report.declared).toBe(1);
		expect(report.examined).toBe(1);
		expect(report.findings).toEqual([]);
	});

	test('a declaration naming a task the manifest does not have is reported, not ignored', async () => {
		const root = await fixtureRoot(
			{ 'check:fixture': 'bun scripts/check-fixture.ts' },
			[['scripts/check-fixture.ts', CONFORMING]],
			{ gates: { 'verify-ghost': 'Declares a task that no longer exists.' } },
		);
		const report = await collectGateConventions(root);
		expect(report.status).toBe('fail');
		expect(report.findings.map((item) => item.message).join('\n')).toContain('no such task');
	});

	test('a task pointing at a missing file is an error, not a convention finding', async () => {
		const root = await fixtureRoot({ 'check:ghost': 'bun scripts/check-ghost.ts' }, []);
		await expect(collectGateConventions(root)).rejects.toThrow('does not exist');
	});

	test('an absent assertion catalog reads as an empty set rather than throwing', async () => {
		const root = await fixtureRoot({ check: 'bun scripts/check-fixture.ts' }, []);
		expect(readAssertionIds(root).size).toBe(0);
	});
});

/**
 * Scratch gate sources for the gate-conventions regression test.
 *
 * Kept out of `test-gate-conventions.ts` so the test file stays a list of cases rather than a list
 * of cases buried in the synthetic gates they run against. Every source here is written as an array
 * of lines joined at the end: the fixtures are gates, and a gate written as one long template
 * literal cannot carry the backticks and quote characters several of these cases exist to exercise.
 */

/** A scratch gate satisfying GC1, GC2, GC3, GC4, GC6 and GC8, over a population fixed in source. */
export const CONFORMING = [
	'#!/usr/bin/env bun',
	'/**',
	' * Enforces: FIXTURE-001 -- the fixture rule.',
	' */',
	"import { exit } from 'node:process';",
	"import { parseArgs } from 'node:util';",
	'',
	'export function runConforming(): number {',
	"\tconsole.log('[OK] conforming -- 1 item examined.');",
	'\treturn 0;',
	'}',
	'',
	'if (import.meta.main) {',
	'\tparseArgs({ args: Bun.argv.slice(2), options: {}, strict: true });',
	'\texit(runConforming());',
	'}',
	'',
].join('\n');

/**
 * A scratch gate violating every statically decidable rule at once: no exported runner, no main
 * guard, imperative statements at module scope, an exit code outside 0/1/2, no status marker, a
 * pictograph, hand-read `argv`, no `Enforces:` line, and a `--json` flag with no envelope.
 *
 * The pictograph is written as an escape so this file does not itself carry one.
 */
export const VIOLATING = [
	'#!/usr/bin/env bun',
	'/** A scratch gate that conforms to nothing. */',
	'',
	"const target = process.argv[2] ?? '.';",
	"console.log('scanned', target, '\\u2705');",
	"if (process.argv.includes('--json')) {",
	"\tconsole.log('{}');",
	'}',
	"if (target === 'nope') {",
	'\tprocess.exit(3);',
	'}',
	'',
].join('\n');

/**
 * A conforming scratch gate that discovers its population, with a caller-supplied success line.
 *
 * GC5 only reaches gates whose item set is found at run time, so the `readdirSync` here is what
 * puts the fixture in scope; `CONFORMING` is the fixed-population counterpart that must stay exempt.
 */
export function discovering(name: string, success: string[]): string {
	return [
		'#!/usr/bin/env bun',
		'/**',
		` * Enforces: FIXTURE-005 -- the ${name.toLowerCase()} rule.`,
		' */',
		"import { readdirSync } from 'node:fs';",
		"import { exit } from 'node:process';",
		"import { parseArgs } from 'node:util';",
		'',
		`export function run${name}(): number {`,
		"\tconst files = readdirSync('.');",
		...success.map((line) => `\t${line}`),
		'\treturn 0;',
		'}',
		'',
		'if (import.meta.main) {',
		'\tparseArgs({ args: Bun.argv.slice(2), options: {}, strict: true });',
		`\texit(run${name}());`,
		'}',
		'',
	].join('\n');
}

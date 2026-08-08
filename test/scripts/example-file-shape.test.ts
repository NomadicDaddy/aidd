import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { configSchema } from '../../shared/src/config/schema.ts';
import { buildBackendSubprocessEnv } from '../../shared/src/subprocess-env.ts';

// spernakit enforces "an example file and the real thing agree on shape" with
// `check-secrets-shape`, which discovers pairs by globbing `config/*.secrets.json{,.example}`.
// aidd has no `config/` directory and no `*.secrets.json` of any kind, so that gate would print
// its no-pairs [SKIP] on every run in every checkout -- it does not port. The rule does apply:
// aidd ships three example files a user is told to copy, and each has a different consumer that
// decides whether the copy actually works. Nothing checked any of them. These tests do.
//
// `portable-gates-aidd-targets.json.example` is deliberately not covered. It is a roster of
// deliberately fictional repository names rather than a key template, so there is no shape to
// compare -- and its live counterpart holds private sibling repository names that must not be
// read into a tracked test.

const repoRoot = join(import.meta.dir, '..', '..');
const read = (name: string) => readFile(join(repoRoot, name), 'utf8');

describe('config.json.example is a config the schema would accept', () => {
	// The example ships inside the release archive and the standalone distribution
	// (scripts/lib/release/common.ts, scripts/lib/standalone/constants.ts), so a user's first
	// config is a copy of it. `configSchema` is .strict() at every level, which makes this one
	// assertion cover both drift directions: a key the schema has since dropped fails as
	// unrecognised, and a key the schema has since required fails as missing.
	test('parses clean against the strict schema', async () => {
		const parsed = configSchema.safeParse(JSON.parse(await read('config.json.example')));

		const issues = parsed.success
			? []
			: parsed.error.issues.map(
					(issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
				);
		expect(issues).toEqual([]);
	});
});

describe('compose.vars.example declares what the production compose file reads', () => {
	/** Every `${NAME}`, `${NAME:-default}` and `${NAME:?message}` interpolation in the file. */
	async function interpolatedVars(): Promise<Set<string>> {
		const yml = await read('docker-compose.production.yml');
		return new Set(
			[...yml.matchAll(/\$\{([A-Z_][A-Z0-9_]*)[:?}-]/g)].map((m) => m[1] as string),
		);
	}

	/** Bare `NAME=` assignments, ignoring the file's comment prose. */
	async function declaredVars(): Promise<Set<string>> {
		const text = await read('compose.vars.example');
		return new Set([...text.matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)].map((m) => m[1] as string));
	}

	// The three `:?` vars have no fallback at all, so an undeclared one aborts `compose up`
	// outright; the rest would silently take a default the user did not choose.
	test('every interpolated variable is present in the example', async () => {
		const declared = await declaredVars();
		const missing = [...(await interpolatedVars())]
			.filter((name) => !declared.has(name))
			.sort();
		expect(missing).toEqual([]);
	});

	test('the example declares no variable the compose file never reads', async () => {
		const interpolated = await interpolatedVars();
		const orphans = [...(await declaredVars())]
			.filter((name) => !interpolated.has(name))
			.sort();
		expect(orphans).toEqual([]);
	});
});

describe('compose.env.example declares only keys something actually consumes', () => {
	// The file's own header states the constraint: container env reaches a launched agent CLI
	// only when allowlisted in shared/src/subprocess-env.ts, and anything else is silently
	// dropped. A key added here without a matching allowlist entry is the worst kind of
	// regression -- the user sets it, the stack starts, and nothing happens.
	async function declaredKeys(): Promise<string[]> {
		const text = await read('compose.env.example');
		return [...text.matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)].map((m) => m[1] as string);
	}

	/** Asks the real allowlist, via the function that applies it, rather than a copied constant. */
	function reachesBackendCli(key: string): boolean {
		return buildBackendSubprocessEnv({}, { [key]: 'probe' })[key] === 'probe';
	}

	test('every key either reaches a backend CLI or is read by the container entrypoint', async () => {
		const entrypoint = await read('docker/entrypoint.sh');
		const orphans = (await declaredKeys())
			.filter((key) => !reachesBackendCli(key) && !entrypoint.includes(key))
			.sort();

		expect(orphans).toEqual([]);
	});

	// Guards the assertion above against becoming vacuous: if the allowlist probe silently
	// started returning true for everything, the orphan check could never fail again.
	test('the allowlist probe still rejects a key that is not allowlisted', () => {
		expect(reachesBackendCli('ANTHROPIC_API_KEY')).toBe(true);
		expect(reachesBackendCli('AIDD_NOT_AN_ALLOWLISTED_KEY')).toBe(false);
	});
});

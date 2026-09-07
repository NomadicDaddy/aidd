import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { repoRoot, sourceFiles, stripComments } from '../_helpers/source-scan.ts';
import {
	persistedReasoningEffortValues,
	reasoningEffortValues,
} from '../../shared/src/args/constants.ts';
import { backendNames } from '../../shared/src/plan/types.ts';

// spernakit enforces "the API's enums and the schema's enums agree" with `check-api-types`, whose
// real half is `validateEnums()` -- a hardcoded list of four types (`UserRole`, `NotificationType`,
// `ApiKeyScope`, and a hand-pinned workspace-member role set) read out of
// `backend/src/schemas/domain.ts`. aidd has none of those four types and no `backend/src/schemas/`
// directory at all, so nothing in that gate ports verbatim.
//
// The rule ports, and aidd needs it more than spernakit does. Two value sets are restated across
// the codebase by hand: the reasoning-effort levels and the backend names. Between them they are
// declared in twenty-four places spread over five layers -- SQL CHECK constraints, TypeBox route
// unions, backend TS types, shared arrays, and frontend option lists. Only one declaration of each
// is canonical.
//
// Three of those layers are out of reach of the typechecker, and the SQL constraints are the worst
// of them: if a value is added to the shared array and not to the CHECK, every layer compiles, the
// UI offers the new value, and SQLite rejects the write at runtime. `Set<T>` is nearly as bad --
// TypeScript rejects a member that is not in the union but says nothing about one that is missing,
// so `backend/src/services/director/helpers.ts` typechecks fine while silently dropping a level.
//
// This scans for literal sets drawn from either vocabulary and requires each to be either the
// canonical list or a registered deliberate subset. A site that drops a value stops matching the
// canonical list and is not registered, so it fails; a site that gains one fails the same way.
// That is also what keeps `max` honest: `reasoningEffortValues` adds it as a CLI input value that
// is normalized away before persistence, so a persisted-layer site that grew to seven values would
// surface here rather than at the database.

interface Vocabulary {
	/** The one declaration every other declaration of this set has to match. */
	canonical: readonly string[];
	name: string;
	/** Every value the vocabulary can legitimately contain, canonical or not. */
	values: readonly string[];
}

const VOCABULARIES: Vocabulary[] = [
	{
		canonical: persistedReasoningEffortValues,
		name: 'reasoning effort',
		values: reasoningEffortValues,
	},
	{ canonical: backendNames, name: 'backend name', values: backendNames },
];

/**
 * Sets that draw on a shared vocabulary without being a copy of it. Each is a real distinction the
 * codebase makes, not a stale copy, and each is pinned here so that narrowing or widening one is a
 * deliberate edit in two places rather than a silent one in a single file.
 */
const DECLARED_SUBSETS: { file: string; members: string[]; name: string; why: string }[] = [
	{
		file: 'shared/src/args/constants.ts',
		members: ['low', 'medium', 'high'],
		name: 'thinkingLevelValues',
		why: "ollama's thinking levels, which are a separate provider-facing scale that happens to share three words with reasoning effort",
	},
	{
		file: 'shared/src/agent/client/request.ts',
		members: ['high', 'low', 'medium'],
		name: 'isOllamaThinkingLevel',
		why: 'the type guard for the above; must stay equal to thinkingLevelValues',
	},
	{
		file: 'shared/src/orchestrator/complexity.ts',
		members: ['high', 'low', 'medium'],
		name: 'ComplexityTier',
		why: 'how much planning a feature needs; an unrelated enum that overlaps the vocabulary by accident',
	},
	{
		file: 'shared/src/modes/audit-parsing.ts',
		members: ['critical', 'high', 'low', 'medium'],
		name: 'findingSeverities',
		why: 'audit finding severity; also unrelated, and carries a value the reasoning vocabulary does not have',
	},
	{
		file: 'shared/src/backends/process-cli-backend.ts',
		members: ['claude-code', 'cline', 'codex', 'grok', 'kilocode', 'opencode'],
		name: 'ProcessCliBackendName',
		why: 'the backends driven by spawning a vendor CLI, as opposed to the four that run in process through NativeBackend',
	},
	{
		file: 'cli/src/plan/resolve.ts',
		members: ['lmstudio', 'native', 'ollama', 'openai'],
		name: 'nativeBackends',
		why: 'the in-process backends, all of which resolve to the same prompts/_cli/native.md fragment',
	},
	{
		file: 'cli/src/prompts/snapshot-matrix.ts',
		members: ['native', 'claude-code', 'opencode', 'kilocode', 'codex', 'cline', 'grok'],
		name: 'snapshotBackends',
		why: 'the backends with distinct compiled prompts; the other three are byte-identical to native and are covered by test/cli/snapshot-matrix.test.ts',
	},
];

const SCAN_ROOTS = ['backend/src', 'cli/src', 'frontend/src', 'shared/src'];
const SCHEMA_DIR = join(repoRoot, 'backend', 'src', 'db', 'schema');

/** A run of quoted literals joined by `|` or `,`: a union, an array, or a Set's constructor arg. */
const LITERAL_RUN = /(?:'[^'\n]*'|"[^"\n]*")(?:\s*[|,]\s*(?:'[^'\n]*'|"[^"\n]*"))+/g;
const LITERAL = /'([^'\n]*)'|"([^"\n]*)"/g;
/** `t.Literal('x')` is how a TypeBox route union spells the same thing; flatten it to `'x'`. */
const TYPEBOX_LITERAL = /t\.Literal\(\s*(['"][^'"]*['"])\s*\)/g;

interface Site {
	file: string;
	line: number;
	members: string[];
	vocabulary: Vocabulary;
}

function findSites(): Site[] {
	const sites: Site[] = [];
	for (const file of sourceFiles(SCAN_ROOTS)) {
		const rel = relative(repoRoot, file).replace(/\\/g, '/');
		const text = stripComments(readFileSync(file, 'utf8')).replace(TYPEBOX_LITERAL, '$1');
		for (const run of text.matchAll(LITERAL_RUN)) {
			const raw = [...(run[0] as string).matchAll(LITERAL)].map(
				(m) => (m[1] ?? m[2]) as string,
			);
			// A leading '' is the "not set" option a select needs; it is not a member of the set.
			const members = raw.filter((value) => value !== '');
			for (const vocabulary of VOCABULARIES) {
				const hits = members.filter((value) => vocabulary.values.includes(value)).length;
				// Enough of the run has to come from the vocabulary to be a restatement of it, but
				// not all of it: a site that gained a value the vocabulary never had is exactly
				// the drift worth catching, and demanding a perfect match would skip it silently.
				if (hits < 3 || hits < members.length * 0.6) continue;
				const line = text.slice(0, run.index).split('\n').length;
				sites.push({ file: rel, line, members, vocabulary });
			}
		}
	}
	return sites;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

describe('every restatement of a shared enum matches its canonical list', () => {
	const sites = findSites();

	// The load-bearing assertion. Adding a reasoning level or a backend to the shared array and
	// missing one of the two dozen hand-written copies is the failure this exists to catch, and
	// three of those copies are SQL constraints that no compiler will ever look at.
	test('no declaration drifts from the list it copies', () => {
		const drifted = sites
			.filter((site) => !sameSet(site.members, site.vocabulary.canonical))
			.filter(
				(site) =>
					!DECLARED_SUBSETS.some(
						(subset) =>
							subset.file === site.file && sameSet(subset.members, site.members),
					),
			)
			.map(
				(site) =>
					`${site.file}:${site.line} declares [${site.members.join(',')}] but the canonical ${site.vocabulary.name} list is [${site.vocabulary.canonical.join(',')}]`,
			)
			.sort();

		expect(drifted).toEqual([]);
	});

	// Without this the registry only grows, and an entry left behind by a deleted declaration
	// would keep excusing any future set that happened to match it.
	test('no registered subset describes a declaration that no longer exists', () => {
		const stale = DECLARED_SUBSETS.filter(
			(subset) =>
				!sites.some(
					(site) => site.file === subset.file && sameSet(site.members, subset.members),
				),
		)
			.map((subset) => `${subset.name} (${subset.file})`)
			.sort();

		expect(stale).toEqual([]);
	});

	// A regex that stopped matching would leave every assertion above trivially true, so the floors
	// are deliberately close to the counts observed when this was written (17 and 7). They are
	// floors rather than exact counts because consolidating a hand-written copy onto the shared
	// import is the improvement this test wants to encourage, not a failure.
	test('the scan reached the declarations it claims to cover', () => {
		expect(sourceFiles(SCAN_ROOTS).length).toBeGreaterThan(500);
		const counted = VOCABULARIES.map((vocabulary) => {
			const copies = sites.filter(
				(site) =>
					site.vocabulary === vocabulary && sameSet(site.members, vocabulary.canonical),
			);
			return `${vocabulary.name}: ${copies.length >= (vocabulary.name === 'backend name' ? 6 : 15)}`;
		});

		expect(counted).toEqual(['reasoning effort: true', 'backend name: true']);
	});
});

describe('the database constrains the columns that hold these enums', () => {
	// The value sets in the CHECK constraints are covered above, since the schema is TypeScript.
	// What that cannot see is a column added with no constraint at all: the drift then is not a
	// wrong list but a missing one, and the column silently accepts any string forever.
	test('every enum-valued column carries a CHECK constraint naming it', () => {
		const missing: string[] = [];
		for (const entry of readdirSync(SCHEMA_DIR)) {
			if (!entry.endsWith('.ts')) continue;
			const text = stripComments(readFileSync(join(SCHEMA_DIR, entry), 'utf8'));

			// Per table, not per file. `runsTables.ts` declares three separate `backend` columns in
			// three tables, so a file-wide set of constrained names lets two of them lose their
			// constraint entirely and still read as covered by the third.
			for (const block of text.split(/^export const /m)) {
				const table = /^(\w+)/.exec(block)?.[1] ?? '(preamble)';

				const constrained = new Set<string>();
				for (const statement of block.matchAll(/sql`([^`]*)`/g)) {
					if (!(statement[1] as string).includes('IN (')) continue;
					for (const ref of (statement[1] as string).matchAll(/\$\{table\.(\w+)\}/g)) {
						constrained.add(ref[1] as string);
					}
				}

				for (const column of block.matchAll(/^\t*(\w+): text\(/gm)) {
					const name = column[1] as string;
					if (!/^(launch)?(backend|reasoningEffort)$/i.test(name)) continue;
					if (!constrained.has(name)) missing.push(`${entry} ${table}.${name}`);
				}
			}
		}

		expect(missing.sort()).toEqual([]);
	});
});

describe('the two backend families cover the canonical list exactly', () => {
	// `cli/src/plan/resolve.ts` and `cli/src/prompts/snapshot-matrix.ts` each explain in a comment
	// that the in-process backends and the CLI-spawning backends together account for every name.
	// A new backend that joined neither family would resolve to a prompt fragment that does not
	// exist, and `readFragment` swallows that ENOENT rather than reporting it.
	const membersOf = (name: string) =>
		(DECLARED_SUBSETS.find((subset) => subset.name === name)?.members ?? []).slice().sort();

	const inProcess = membersOf('nativeBackends');
	const processCli = membersOf('ProcessCliBackendName');

	test('the families are disjoint and together they are the canonical list', () => {
		expect(inProcess.filter((name) => processCli.includes(name))).toEqual([]);
		expect([...inProcess, ...processCli].sort()).toEqual([...backendNames].sort());
	});

	test('the snapshot matrix is native plus every CLI-spawning backend', () => {
		expect(membersOf('snapshotBackends')).toEqual(['native', ...processCli].sort());
	});
});

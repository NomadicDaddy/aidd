import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { repoRoot, sourceFiles, stripComments } from '../_helpers/source-scan.ts';
import {
	buildBackendSubprocessEnv,
	buildToolSubprocessEnv,
} from '../../shared/src/subprocess-env.ts';

// spernakit enforces ASSERT-035 ("env reads are confined to the config layer") with
// `check-process-env`, which allowlists two FILE PATHS and fails any other file that touches the
// environment. That form does not port. aidd deliberately reads the environment through an
// injected parameter -- `env: NodeJS.ProcessEnv = process.env` appears in fourteen signatures so
// the reads are reachable from a test -- and a path allowlist cannot tell a seam like that from
// the ambient read it exists to prevent. Adding fourteen files to an allowlist would leave the
// rule enforcing nothing.
//
// aidd carries the same underlying rule under different words: persistent configuration lives in
// `~/.aidd/config.json`, never in `.env` files or arbitrary environment reads, with two documented
// exemptions (see the `shared/src/subprocess-env.ts` header). The enforceable form here is
// therefore an allowlist of KEYS rather than of files. Every key below is a key some source file
// consults to change aidd's behaviour, and the registry is the only place they are written down.
//
// This is a different subject from `check-env-spread`, which bounds what is handed to a CHILD
// process. Neither subsumes the other: a file can read a config setting it never forwards, and
// forward one it never reads.
//
// Known limit, stated so nobody reads a pass as more than it is: a key assembled at runtime is
// invisible to a source scan. The `unresolved` assertion is what keeps that limit from widening
// silently -- a new computed read fails the suite rather than slipping past it.

type Category = 'build' | 'handoff' | 'provider' | 'secret' | 'shell' | 'toggle';

/**
 * Every environment key aidd's application code reads, and why it is not configuration.
 * A key that belongs in `config.json` does not belong here; add it to the schema instead.
 */
const REGISTRY: Record<string, { category: Category; why: string }> = {
	AIDD_BASH: { category: 'toggle', why: 'overrides the bash binary the agent shell tool spawns' },
	AIDD_DISABLE_FLAILING_GUARD: {
		category: 'toggle',
		why: 'disables the flailing guard in tests',
	},
	AIDD_EXT_APP_URL: { category: 'handoff', why: 'web app URL passed to a CLI run it launched' },
	AIDD_EXT_LOG_PATH: {
		category: 'handoff',
		why: 'log path passed to a CLI run the web launched',
	},
	AIDD_EXT_RUN_DRIVER_ID: {
		category: 'handoff',
		why: 'driver identity passed from a managed launcher to its CLI run',
	},
	AIDD_EXT_RUN_DRIVER_KIND: {
		category: 'handoff',
		why: 'driver kind passed from a managed launcher to its CLI run',
	},
	AIDD_EXT_RUN_DRIVER_SHA256: {
		category: 'handoff',
		why: 'driver content hash passed from a managed launcher to its CLI run',
	},
	AIDD_EXT_RUN_ID: { category: 'handoff', why: 'run id passed to a CLI run the web launched' },
	AIDD_EXT_RUN_INITIATOR: {
		category: 'handoff',
		why: 'whether a person or aidd itself asked for a CLI run the web launched',
	},
	AIDD_EXT_RUN_SOURCE: { category: 'handoff', why: 'origin of a CLI run the web launched' },
	AIDD_NATIVE_SIMULATION: {
		category: 'toggle',
		why: 'test/CI only; short-circuits the native backend before any provider call',
	},
	AIDD_SKIP_DOCTOR: { category: 'toggle', why: 'skips preflight doctor checks in tests' },
	AIDD_SLOW_QUERY_MS: { category: 'toggle', why: 'slow-query log threshold for diagnostics' },
	AIDD_SUPPRESS_CLI_HEARTBEAT: {
		category: 'toggle',
		why: 'suppresses the CLI active-run heartbeat in tests',
	},
	AIDD_TELEGRAM_BOT_TOKEN: {
		category: 'secret',
		why: 'supplies channels.telegram.botToken so the config file need not hold it',
	},
	AIDD_WEB_AUTH_TOKEN: {
		category: 'secret',
		why: 'supplies web.authToken so the config file need not hold it',
	},
	COMSPEC: { category: 'shell', why: 'Windows comspec, for terminal shell detection' },
	DEV: {
		category: 'build',
		why: 'Vite `import.meta.env.DEV`, substituted at build time rather than read at runtime',
	},
	MODE: {
		category: 'build',
		why: 'Vite `import.meta.env.MODE`, substituted at build time; names the bundle mode in the published build identity',
	},
	NATIVE_API_KEY: { category: 'provider', why: 'native backend provider credential' },
	NATIVE_BASE_URL: { category: 'provider', why: 'native backend endpoint override' },
	NATIVE_MODEL: { category: 'provider', why: 'native backend model override' },
	NATIVE_PROVIDER: { category: 'provider', why: 'native backend provider selection' },
	OPENAI_API_KEY: { category: 'provider', why: 'OpenAI-compatible provider credential' },
	PATH: { category: 'shell', why: 'binary resolution for spawned processes' },
	PATHEXT: { category: 'shell', why: 'Windows executable extensions for binary resolution' },
	SHELL: { category: 'shell', why: 'POSIX login shell, for terminal shell detection' },
	XAI_API_KEY: { category: 'provider', why: 'xAI provider credential' },
	ZHIPU_API_KEY: { category: 'provider', why: 'Zhipu provider credential' },
};

const SCAN_ROOTS = ['backend/src', 'cli/src', 'frontend/src', 'shared/src'];

/** `const NAME = 'LITERAL'` declarations, so `env[SOME_KEY_CONST]` resolves to the key it names. */
function constantMap(files: string[]): Map<string, string> {
	const map = new Map<string, string>();
	const declaration = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*['"]([^'"]+)['"]/g;
	for (const file of files) {
		for (const match of readFileSync(file, 'utf8').matchAll(declaration)) {
			map.set(match[1] as string, match[2] as string);
		}
	}
	return map;
}

// Matches `env.KEY` in every shape aidd uses it: `process.env.KEY`, `Bun.env.KEY`, `deps.env.KEY`,
// `import.meta.env.KEY`, and a bare injected `env.KEY`. The lookbehind drops quoted mentions so a
// redaction list naming a key as a string is not mistaken for a read of it.
const DOT_READ = /(?<!['"`])\benv\.([A-Z][A-Z0-9_]{2,})\b/g;
const QUOTED_READ = /\benv\[\s*(['"])([A-Za-z_][\w]*)\1\s*\]/g;
const COMPUTED_READ = /\benv\[\s*([A-Za-z_$][\w$]*)\s*\](?!\s*=[^=])/g;

interface Scan {
	keys: Map<string, string[]>;
	unresolved: string[];
}

function scanEnvReads(): Scan {
	const files = sourceFiles(SCAN_ROOTS);
	const constants = constantMap(files);
	const keys = new Map<string, string[]>();
	const unresolved: string[] = [];
	const record = (key: string, where: string) => {
		if (!keys.has(key)) keys.set(key, []);
		(keys.get(key) as string[]).push(where);
	};

	for (const file of files) {
		const rel = relative(repoRoot, file).replace(/\\/g, '/');
		// Prose that discusses the environment is not a read of it, and neither is a read that
		// somebody commented out; `stripComments` blanks both without moving any line number.
		stripComments(readFileSync(file, 'utf8'))
			.split('\n')
			.forEach((line, index) => {
				const at = `${rel}:${index + 1}`;
				for (const match of line.matchAll(DOT_READ)) record(match[1] as string, at);
				for (const match of line.matchAll(QUOTED_READ)) record(match[2] as string, at);
				for (const match of line.matchAll(COMPUTED_READ)) {
					const resolved = constants.get(match[1] as string);
					if (resolved) record(resolved, at);
					else unresolved.push(`${at}: env[${match[1]}]`);
				}
			});
	}
	return { keys, unresolved };
}

describe('every environment key aidd reads is registered and justified', () => {
	const scan = scanEnvReads();

	// The load-bearing assertion. A setting that arrives through the environment instead of
	// config.json shows up here as an unregistered key, which is the whole point of the rule.
	test('no source file reads an unregistered key', () => {
		const unregistered = [...scan.keys.entries()]
			.filter(([key]) => !(key in REGISTRY))
			.map(([key, sites]) => `${key} (${sites[0]})`)
			.sort();

		expect(unregistered).toEqual([]);
	});

	// Without this the registry would only ever grow, and a stale entry would read as coverage of
	// a key nothing consults any more.
	test('no registry entry describes a key nothing reads', () => {
		const stale = Object.keys(REGISTRY)
			.filter((key) => !scan.keys.has(key))
			.sort();

		expect(stale).toEqual([]);
	});

	// A computed read is the one shape a source scan cannot follow, so it has to fail rather than
	// be skipped: otherwise the check above quietly stops covering whatever moved behind it.
	test('no environment read is assembled at runtime', () => {
		expect(scan.unresolved).toEqual([]);
	});

	test('the scan reached the source tree it claims to cover', () => {
		expect(sourceFiles(SCAN_ROOTS).length).toBeGreaterThan(500);
		expect(scan.keys.size).toBeGreaterThan(15);
	});
});

describe('the keys aidd reads and the keys it forwards agree', () => {
	// A shell fact or provider credential that aidd consults but never forwards would work in the
	// parent and silently vanish in the agent CLI it launches -- the same silent-drop failure the
	// compose.env.example guard covers, seen from the other side. Toggles are deliberately local
	// and are excluded.
	test('every shell and provider key also reaches a backend subprocess', () => {
		const shouldForward = Object.entries(REGISTRY)
			.filter(([, meta]) => meta.category === 'provider' || meta.category === 'shell')
			.map(([key]) => key);

		const dropped = shouldForward
			.filter((key) => buildBackendSubprocessEnv({}, { [key]: 'probe' })[key] !== 'probe')
			.sort();

		expect(dropped).toEqual([]);
	});

	// The mirror image, and the reason the `secret` category exists. These keys hold the
	// credentials that `~/.aidd/config.json` used to carry in plaintext; moving them into the
	// environment is only an improvement while they stay in aidd's own process. Forwarding one
	// to a spawned agent CLI -- which reads its own environment and runs shell commands with
	// permission gates disabled -- would put the credential right back within an agent's reach,
	// just under a different name. No backend needs either value.
	test('no operator credential reaches a spawned subprocess', () => {
		const secrets = Object.entries(REGISTRY)
			.filter(([, meta]) => meta.category === 'secret')
			.map(([key]) => key);

		expect(secrets.length).toBeGreaterThan(0);

		const leaked = secrets
			.filter((key) => {
				const probe = { [key]: 'probe' };
				return (
					buildBackendSubprocessEnv({}, probe)[key] !== undefined ||
					buildToolSubprocessEnv(probe)[key] !== undefined
				);
			})
			.sort();

		expect(leaked).toEqual([]);
	});
});

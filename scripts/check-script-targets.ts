#!/usr/bin/env bun
/**
 * Require every `package.json` script to resolve: the files it names must exist, and the tasks it
 * chains must be defined.
 *
 * Enforces: no `package.json` script references a script file that is absent or a `bun run` target
 * that no manifest defines. No assertion ID; this is a wiring invariant rather than a catalog rule.
 *
 * A task name and the file behind it move on different mechanisms in a derived application. Task
 * names live in `package.json`, which `scripts/template-manifest.json` classifies as `branded`, so
 * `sync.ps1` never carries it. Script files are template-managed, so drift detection does carry
 * them, renames included. An application that receives one without the other is broken rather than
 * stale: `bun run check-deps` points at a `check-dependency-versions.ts` the upgrade just deleted,
 * and the failure surfaces whenever someone next runs that task rather than during the upgrade that
 * caused it. Nothing else in this repository looks at both sides at once.
 *
 * Two of the renames that motivated this check sit on the `qc` path and would have failed loudly.
 * The other six do not, which is the whole argument for a gate: a half-applied rename is caught in
 * the same run that applies it instead of weeks later, in whichever repository received it.
 *
 * The check is deliberately narrow about what counts as a file reference. Only tokens that end in a
 * script extension are resolved, so output paths, globs, and inline `bun -e` code cannot produce a
 * finding. A rule that guesses is a rule that gets waived.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cwd, exit } from 'node:process';
import { parseArgs } from 'node:util';

/** Extensions a command can name and this repository can be expected to ship. */
const SCRIPT_FILE = /^[\w./@-]+\.(?:ts|tsx|sh|ps1|mjs|cjs|js)$/;

/** Package managers whose `run` subcommand names another task in a manifest. */
const RUNNERS = new Set(['bun', 'bunx', 'npm', 'pnpm', 'yarn']);

/** Flags that take a value, so the token after them is never a task name. */
const VALUED_FLAGS = new Set(['--config', '--cwd', '--filter']);

export interface ScriptTargetFinding {
	reason: string;
	script: string;
}

export interface ScriptTargetsResult {
	code: number;
	examined: number;
	findings: ScriptTargetFinding[];
}

function readScripts(manifestPath: string): Record<string, string> {
	const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${manifestPath} must contain one JSON object.`);
	}
	const scripts = (parsed as { scripts?: unknown }).scripts;
	if (scripts === undefined) return {};
	if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) {
		throw new Error(`${manifestPath} has a "scripts" key that is not an object.`);
	}
	const out: Record<string, string> = {};
	for (const [name, command] of Object.entries(scripts)) {
		if (typeof command === 'string') out[name] = command;
	}
	return out;
}

/**
 * Split a command into the segments a shell would run separately, with double-quoted spans removed
 * first. `bun -e "…"` carries JavaScript that contains semicolons and quoted paths, and tokenizing
 * it would invent references the command never makes.
 */
function segments(command: string): string[][] {
	return command
		.replace(/"[^"]*"/g, ' ')
		.split(/&&|\|\||[;|]/)
		.map((part) =>
			part
				.split(/\s+/)
				.map((token) => token.replace(/^[("']+/, '').replace(/[)"']+$/, ''))
				.filter((token) => token !== ''),
		)
		.filter((tokens) => tokens.length > 0);
}

/** File tokens a segment names, in order. Flags are never files, even when they end in `.ts`. */
function fileReferences(tokens: string[]): string[] {
	return tokens.filter((token) => !token.startsWith('-') && SCRIPT_FILE.test(token));
}

/**
 * Every script file a command names, across all of its segments. Exported so setup's branding pass
 * can ask this module which file a task runs instead of carrying a second, weaker parser: the
 * question "which task points at a file this app will not receive" is the same one this gate
 * answers, and the two drifting apart is what shipped three unrunnable tasks to every new app.
 */
export function commandFileReferences(command: string): string[] {
	return segments(command).flatMap(fileReferences);
}

export interface TaskReference {
	/** Directory holding the manifest that must define the task, relative to the project root. */
	dir: string;
	task: string;
}

/**
 * Tasks a segment invokes through `<runner> run`. Everything after the `run` token that is not a
 * flag is a task name: `--parallel` takes two, `--cwd <dir>` moves the lookup to a workspace.
 */
export function taskReferences(tokens: string[]): TaskReference[] {
	if (tokens.length === 0 || !RUNNERS.has(tokens[0] ?? '')) return [];
	const runAt = tokens.indexOf('run');
	if (runAt === -1) return [];

	const references: TaskReference[] = [];
	let dir = '.';
	for (let index = runAt + 1; index < tokens.length; index += 1) {
		const token = tokens[index] ?? '';
		if (token.startsWith('-')) {
			if (VALUED_FLAGS.has(token)) {
				if (token === '--cwd') dir = tokens[index + 1] ?? dir;
				index += 1;
			}
			continue;
		}
		references.push({ dir, task: token });
	}
	return references;
}

interface Manifests {
	/** Manifest directory to its script names, loaded once per directory. */
	scripts: Map<string, Set<string>>;
}

function scriptsFor(projectRoot: string, dir: string, cache: Manifests): Set<string> | undefined {
	const cached = cache.scripts.get(dir);
	if (cached !== undefined) return cached;
	const manifestPath = join(projectRoot, dir, 'package.json');
	if (!existsSync(manifestPath)) return undefined;
	const names = new Set(Object.keys(readScripts(manifestPath)));
	cache.scripts.set(dir, names);
	return names;
}

export function runScriptTargetsCheck(projectRoot = cwd()): ScriptTargetsResult {
	const manifestPath = join(projectRoot, 'package.json');
	if (!existsSync(manifestPath)) {
		console.error('[FAIL] check:script-targets found no package.json to examine.');
		return { code: 1, examined: 0, findings: [] };
	}

	const scripts = readScripts(manifestPath);
	const names = new Set(Object.keys(scripts));
	const cache: Manifests = { scripts: new Map([['.', names]]) };
	const findings: ScriptTargetFinding[] = [];

	for (const [script, command] of Object.entries(scripts)) {
		for (const tokens of segments(command)) {
			for (const reference of fileReferences(tokens)) {
				if (existsSync(join(projectRoot, reference))) continue;
				findings.push({ reason: `names ${reference}, which does not exist`, script });
			}
			for (const { dir, task } of taskReferences(tokens)) {
				const defined = scriptsFor(projectRoot, dir, cache);
				// An absent workspace manifest is a different repository's problem, or a
				// directory this application does not have. Only a manifest that exists and
				// omits the task is a finding this check can stand behind.
				if (defined === undefined || defined.has(task)) continue;
				const where = dir === '.' ? 'package.json' : `${dir}/package.json`;
				findings.push({ reason: `runs ${task}, which ${where} does not define`, script });
			}
		}
	}

	const examined = Object.keys(scripts).length;
	if (examined === 0) {
		console.error('[FAIL] check:script-targets examined 0 scripts.');
		return { code: 1, examined: 0, findings: [] };
	}

	if (findings.length > 0) {
		console.error(
			`[FAIL] check:script-targets found ${findings.length} unresolved reference(s) across ${examined} scripts.`,
		);
		for (const finding of findings) console.error(`- ${finding.script}: ${finding.reason}`);
		console.error(
			'A task and the file behind it move on different mechanisms in a derived application. Update package.json in the same pass that renames or deletes the file.',
		);
		return { code: 1, examined, findings };
	}

	console.log(`[OK] Every package.json script resolves (${examined} scripts examined).`);
	return { code: 0, examined, findings };
}

function projectRootFromArgs(args: string[]): string {
	const { values } = parseArgs({
		args,
		options: { 'project-dir': { type: 'string' } },
		strict: true,
	});
	const value = values['project-dir'];
	if (value === undefined) return cwd();
	// parseArgs takes the token after a string option as its value even when that token is itself a
	// flag, and resolve('') silently returns the working directory. Both would grade the wrong
	// repository and report it as this one.
	if (value.trim() === '' || value.startsWith('-')) {
		throw new Error('--project-dir requires a path.');
	}
	return resolve(value);
}

if (import.meta.main) {
	// A bad argument exits 2. Exiting 1 would report a mistyped flag as a real unresolved reference,
	// which is the one thing a caller cannot tell apart from a genuine finding.
	let projectRoot: string;
	try {
		projectRoot = projectRootFromArgs(Bun.argv.slice(2));
	} catch (err) {
		console.error(
			`[FAIL] check:script-targets: ${err instanceof Error ? err.message : String(err)}`,
		);
		console.error('Usage: check-script-targets [--project-dir <path>]');
		exit(2);
	}
	try {
		exit(runScriptTargetsCheck(projectRoot).code);
	} catch (err) {
		console.error(
			`[FAIL] check:script-targets: ${err instanceof Error ? err.message : String(err)}`,
		);
		exit(1);
	}
}

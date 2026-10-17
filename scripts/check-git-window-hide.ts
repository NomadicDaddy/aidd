#!/usr/bin/env bun
/**
 * Git Subprocess Window Visibility Check
 *
 * Enforces: ASSERT-024 (spernakit) / SEC-006 (aidd) -- every direct git subprocess passes
 * `windowsHide: true`.
 *
 * Every direct Git subprocess must pass `windowsHide: true`. On Windows a spawn without it
 * flashes a real console window, so a background gate or a hook run visibly blinks the desktop
 * — and in a packaged app it looks like a crash. The flag is inert everywhere else, so the rule
 * is unconditional rather than platform-gated.
 *
 * This scans for *direct* spawns only. Local helpers that wrap a spawn (`run(['git', …])`) are
 * intentionally not flagged: the flag belongs on the helper's own spawn call, which this check
 * sees at that call site.
 *
 * This file is delivered by `sync-shared-core.ts`, so `SCAN_ROOTS` is the union across carriers and
 * a root that does not exist here is skipped rather than failed. The union is load-bearing rather
 * than tidy: a single carrier's own root list can miss a whole top-level directory (`skills/`,
 * say) holding a real unhidden spawn, and two hand-kept lists drift apart. Widen this list rather
 * than narrowing it.
 *
 * Usage:
 *   bun scripts/check-git-window-hide.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { exit } from 'node:process';

const DEFAULT_PROJECT_ROOT = join(import.meta.dir, '..');
const SCAN_ROOTS = [
	'backend/src',
	'cli/src',
	'frontend/src',
	'scripts',
	'shared/src',
	'skills',
	'test',
];
const SKIP_DIRS = new Set([
	'.aidd',
	'.git',
	'build',
	'coverage',
	'data',
	'dist',
	'logs',
	'node_modules',
]);
const SCANNED_EXTENSIONS = ['.js', '.mjs', '.ts', '.tsx'];

interface Violation {
	content: string;
	file: string;
	line: number;
}

function* walkDir(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walkDir(fullPath);
		} else if (entry.isFile() && SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
			yield fullPath;
		}
	}
}

/** A call that can start a process directly: Bun's and node's spawn, and node's execFile. */
const SPAWN_CALL = /\b(?:spawn|spawnSync|execFile|execFileSync)\(/g;

/**
 * A spawn call, from its name, whose program is git: given as the first argument, as the first
 * element of the argument array, or as the first element of an options object's `cmd`.
 */
const GIT_FIRST = /^\w+\(\s*(?:\{\s*cmd:\s*)?\[?\s*['"]git['"]/;

/** How far a call's text is followed when its closing parenthesis never comes. */
const CALL_LINE_LIMIT = 200;

/** The code character before which a `/` opens a regular expression rather than dividing. */
const BEFORE_REGEX = '(,=:[!&|?{};+-*%<>~^';

/**
 * The keywords after which a `/` opens a regular expression, as in `return /'/`. `of` is left out
 * on purpose: it is only a keyword inside `for (… of …)`, and anywhere else it is an ordinary name,
 * so `of / 2` divides (Morticia #13529). A regex directly after `for (x of` is the rarer case.
 */
const KEYWORDS_BEFORE_REGEX =
	/(?:^|[^\w$.])(?:await|case|delete|do|else|in|instanceof|new|return|throw|typeof|void|yield)\s*$/;

/** Whether the code just before `index` ends with one of those keywords, not a property name. */
function keywordBefore(text: string, index: number): boolean {
	return KEYWORDS_BEFORE_REGEX.test(text.slice(Math.max(0, index - 64), index));
}

/** The index just past the regular expression literal opening at `start`, or `start + 1`. */
function regexEnd(text: string, start: number): number {
	let inClass = false;
	for (let i = start + 1; i < text.length && text[i] !== '\n'; i++) {
		const char = text[i];
		if (char === '\\') i++;
		else if (char === '[') inClass = true;
		else if (char === ']') inClass = false;
		else if (char === '/' && !inClass) return i + 1;
	}
	return start + 1;
}

/**
 * Which characters of `text` are code rather than string, template text, regular expression or
 * comment. A template's `${…}` substitution is code again, however deeply it nests: a call inside
 * one runs. Built per line, so a string or comment that spans lines is judged from where it starts.
 */
function codeMask(text: string): boolean[] {
	const mask = Array<boolean>(text.length).fill(false);
	/** For each open substitution, the brace depth outside it. */
	const substitutions: number[] = [];
	let braces = 0;
	let quote: null | string = null;
	let previous = '';
	for (let i = 0; i < text.length; i++) {
		const char = text[i] as string;
		const next = text[i + 1];
		if (quote !== null) {
			if (char === '\\') {
				i++;
			} else if (char === quote) {
				quote = null;
				previous = char;
			} else if (quote === '`' && char === '$' && next === '{') {
				substitutions.push(braces++);
				quote = null;
				previous = '{';
				i++;
			}
			continue;
		}
		if (char === '/' && next === '/') {
			const end = text.indexOf('\n', i);
			i = end === -1 ? text.length : end - 1;
		} else if (char === '/' && next === '*') {
			const end = text.indexOf('*/', i + 2);
			i = end === -1 ? text.length : end + 1;
		} else if (
			char === '/' &&
			(previous === '' || BEFORE_REGEX.includes(previous) || keywordBefore(text, i))
		) {
			i = regexEnd(text, i) - 1;
			previous = '/';
		} else if (char === "'" || char === '"' || char === '`') {
			quote = char;
		} else if (char === '}' && substitutions.at(-1) === braces - 1) {
			substitutions.pop();
			braces--;
			quote = '`';
		} else {
			if (char === '{') braces++;
			else if (char === '}') braces--;
			mask[i] = true;
			if (char.trim() !== '') previous = char;
		}
	}
	return mask;
}

/** A call's text through its closing parenthesis, and the same text with only its code kept. */
interface CallText {
	/** Strings, comments and regular expressions blanked, so a comment cannot pass for an option. */
	code: string;
	raw: string;
}

/** The text of the call starting at `column` of line `index`, through its closing parenthesis. */
function callText(lines: string[], index: number, column: number): CallText {
	const text = [
		(lines[index] ?? '').slice(column),
		...lines.slice(index + 1, index + CALL_LINE_LIMIT),
	].join('\n');
	const code = codeMask(text);
	let depth = 0;
	let end = text.length;
	for (let i = 0; i < text.length; i++) {
		if (!code[i]) continue;
		if (text[i] === '(') depth++;
		else if (text[i] === ')' && --depth === 0) {
			end = i + 1;
			break;
		}
	}
	const raw = text.slice(0, end);
	return { code: raw.replace(/[^]/g, (char, i: number) => (code[i] ? char : ' ')), raw };
}

/**
 * The text of each direct git spawn that starts on this line. The call is recognised by its name
 * rather than by its receiver, because `const { spawnSync } = Bun` and a node:child_process import
 * call the same functions bare. Sync forms count too: `Bun.spawnSync(['git', …])` spawns a console
 * window exactly as the async form does. Each call is read to its closing parenthesis, so `'git'`
 * on a later line and `windowsHide` after a long argument list are both inside it, and a call
 * written inside a string is text, not a call. The violation is reported at the call, once.
 */
function directGitSpawns(lines: string[], index: number): CallText[] {
	const line = lines[index] ?? '';
	const code = codeMask(line);
	const calls: CallText[] = [];
	for (const call of line.matchAll(SPAWN_CALL)) {
		if (!code[call.index]) continue;
		const text = callText(lines, index, call.index);
		if (GIT_FIRST.test(text.raw)) calls.push(text);
	}
	return calls;
}

function checkFile(projectRoot: string, filePath: string): Violation[] {
	const relativePath = relative(projectRoot, filePath).replace(/\\/g, '/');
	if (relativePath === 'scripts/check-git-window-hide.ts') return [];

	const lines = readFileSync(filePath, 'utf-8').split(/\r?\n/);
	const violations: Violation[] = [];

	for (let index = 0; index < lines.length; index++) {
		const unhidden = directGitSpawns(lines, index).some(
			(call) => !/windowsHide:\s*true/.test(call.code),
		);
		if (unhidden) {
			violations.push({
				content: (lines[index] ?? '').trim(),
				file: relativePath,
				line: index + 1,
			});
		}
	}

	return violations;
}

export function runGitWindowHide(projectRoot = DEFAULT_PROJECT_ROOT): number {
	const allViolations: Violation[] = [];
	let examined = 0;

	for (const root of SCAN_ROOTS) {
		const absoluteRoot = join(projectRoot, root);
		try {
			statSync(absoluteRoot);
		} catch {
			continue;
		}
		for (const filePath of walkDir(absoluteRoot)) {
			examined++;
			allViolations.push(...checkFile(projectRoot, filePath));
		}
	}

	if (allViolations.length > 0) {
		console.error('[FAIL] Found direct Git subprocesses spawned without windowsHide:\n');
		for (const v of allViolations) {
			console.error(`  ${v.file}:${v.line}: ${v.content}`);
		}
		console.error(
			'\nAdd `windowsHide: true` to the spawn options so no console window appears.',
		);
		return 1;
	}

	// Skipping an absent root is deliberate (see SCAN_ROOTS), but skipping every one of them is a
	// carrier this file should never have been delivered to. Reporting [OK] there would be a pass
	// earned by looking at nothing.
	if (examined === 0) {
		console.error(
			`[FAIL] No source files were examined. None of the scanned roots exist under ` +
				`${projectRoot}: ${SCAN_ROOTS.join(', ')}.`,
		);
		return 1;
	}

	console.log(
		`[OK] Git subprocess window visibility check passed (${examined} file(s) examined).`,
	);
	return 0;
}

if (import.meta.main) exit(runGitWindowHide());

#!/usr/bin/env bun
/**
 * Validates that internal links in Markdown documentation files resolve to existing files.
 *
 * Enforces: every internal Markdown link resolves to a file that exists. No assertion ID in either
 * repository: neither catalog states an invariant over documentation links. spernakit's is silent
 * on documentation entirely, and aidd's QUAL-005 covers the freshness of five named `.aidd/`
 * artifacts, which is a different subject from whether a link resolves.
 *
 * Scans every tracked .md file under the project root, excluding the directories below.
 * Extracts inline links [text](path) and checks that each target file exists.
 * Skips external links (http/https/mailto), anchor-only links (#heading),
 * and image data URIs.
 *
 * Usage:
 *   bun scripts/check-docs.ts
 *   bun run check:docs
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { gitIgnored, toPosixRelative, trackedGitignores } from './lib/docs/git-ignored.ts';
import { markdownFiles } from './lib/docs/scan.ts';
import { type BadWaiver, badWaivers, reportWaivers, waiverReason } from './lib/docs/waivers.ts';

/**
 * The repository this file is delivered into: the parent of the nearest `scripts` directory above
 * it. Not "one level up", so the answer holds whether the file sits in scripts/ or deeper. With no
 * such directory it refuses rather than answer the drive root, which would put the whole drive in
 * scope.
 */
function repositoryRoot(dir: string): string {
	let at = resolve(dir);
	while (basename(at) !== 'scripts') {
		if (dirname(at) === at) throw new Error(`no scripts directory above ${resolve(dir)}`);
		at = dirname(at);
	}
	return dirname(at);
}

const DEFAULT_PROJECT_ROOT = repositoryRoot(fileURLToPath(new URL('.', import.meta.url)));

/** Prefixes that indicate an external or non-file link */
const EXTERNAL_PREFIXES = ['http://', 'https://', 'mailto:', 'data:', 'tel:'];

interface BrokenLink {
	file: string;
	/** The target exists in this working tree and is absent from the repository. */
	ignored: boolean;
	line: number;
	linkText: string;
	target: string;
}

/**
 * Check whether a link target is external (http, mailto, etc.) or anchor-only.
 */
function isExternalOrAnchor(target: string): boolean {
	if (target.startsWith('#')) return true;
	const lower = target.toLowerCase();
	return EXTERNAL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

interface FileReport {
	broken: BrokenLink[];
	waivers: BadWaiver[];
}

/**
 * Extract inline markdown links from a file and validate each target.
 *
 * `isIgnored` answers whether a target that exists is nonetheless absent from the repository. It
 * is a caller-supplied predicate rather than a call to git from here so that the whole scan can
 * ask git once; see `runDocs`.
 */
function checkFile(
	filePath: string,
	projectRoot: string,
	isIgnored: (relativeTarget: string) => boolean,
): FileReport {
	const content = readFileSync(filePath, 'utf-8');
	const lines = content.split('\n');
	const fileDir = dirname(filePath);
	const broken: BrokenLink[] = [];
	const used = new Set<number>();

	// Match inline links: [text](path) but not images ![alt](path) which may use data URIs. The
	// target admits one level of balanced parentheses, as CommonMark does, so `a(b).md` is read
	// whole rather than cut at its first `)` and reported as a missing `a(b`.
	const linkRegex = /(?<!!)\[([^\]]*)\]\(((?:[^()]|\([^()]*\))+)\)/g;
	/** The fence that opened the current code block, or null when outside one. */
	let fence: null | string = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;

		// Track fenced code blocks of either kind. Only a run of the opening character at least as
		// long closes one, so a ``` line inside a ~~~ example is content, not a toggle. A fence still
		// open at end of file is valid Markdown: the block runs to the end, and nothing is reported.
		const run = /^(`{3,}|~{3,})/.exec(line.trimStart())?.[1];
		if (fence === null && run !== undefined) {
			fence = run;
			continue;
		}
		if (fence !== null) {
			if (run?.startsWith(fence) === true && line.trim() === run) fence = null;
			continue;
		}

		// Strip inline code spans to avoid matching links inside backticks
		const lineWithoutCode = line.replace(/`[^`]+`/g, '');

		let match: null | RegExpExecArray;
		linkRegex.lastIndex = 0;

		while ((match = linkRegex.exec(lineWithoutCode)) !== null) {
			const linkText = match[1]!;
			let target = match[2]!.trim();

			// Skip external and anchor-only links
			if (isExternalOrAnchor(target)) continue;

			// Skip template placeholders like [ADR-001-link]
			if (target.startsWith('[') && target.endsWith(']')) continue;

			// Strip anchor from file path (e.g., "STACK.md#section" → "STACK.md")
			const anchorIndex = target.indexOf('#');
			if (anchorIndex > 0) {
				target = target.substring(0, anchorIndex);
			}

			// Strip query params (e.g., "file.md?v=1" → "file.md")
			const queryIndex = target.indexOf('?');
			if (queryIndex > 0) {
				target = target.substring(0, queryIndex);
			}

			// Relative to the file's directory, or to the project root, since some docs use
			// root-relative paths.
			const resolved = [resolve(fileDir, target), resolve(projectRoot, target)].find((path) =>
				existsSync(path),
			);
			const ignored =
				resolved !== undefined && isIgnored(toPosixRelative(projectRoot, resolved));
			if (resolved !== undefined && !ignored) continue;

			// A marker on this line or the one above suppresses it, provided it says why.
			const marker = waiverReason(line) ?? waiverReason(lines[i - 1] ?? '');
			if (marker !== null && marker.length > 0) {
				used.add(i);
				continue;
			}

			broken.push({ file: filePath, ignored, line: i + 1, linkText, target });
		}
	}

	return { broken, waivers: badWaivers(filePath, lines, used) };
}

/**
 * Every path whose content or presence can change this gate's verdict, from the project root with
 * forward slashes, sorted: the markdown files it scans, each link target that resolves, and every
 * tracked .gitignore, which decides what is scanned and which targets count. A target outside the
 * root passes by existing just as one inside does, so it is listed too, starting `../`. A target
 * that is a directory passes by existing, whatever it holds, so it is named with a trailing `/`:
 * its presence is the input, not its content. A cache keyed on these instead of on every markdown
 * file replays only what the gate would decide again. A target that does not resolve is absent
 * because the gate fails on it, and a failure is not replayed.
 */
export function collectDocsInputs(projectRoot = DEFAULT_PROJECT_ROOT): string[] {
	const files = markdownFiles(projectRoot);
	const inputs = new Set([
		...files.map((file) => toPosixRelative(projectRoot, file)),
		...trackedGitignores(projectRoot),
	]);
	const addTarget = (relativeTarget: string): boolean => {
		// The root itself: a link to `.` always resolves.
		if (relativeTarget === '') return false;
		const stat = statSync(resolve(projectRoot, relativeTarget), { throwIfNoEntry: false });
		if (stat?.isFile() === true) inputs.add(relativeTarget);
		else if (stat?.isDirectory() === true) inputs.add(`${relativeTarget}/`);
		return false;
	};
	for (const file of files) checkFile(file, projectRoot, addTarget);
	return [...inputs].sort();
}

export function runDocs(projectRoot = DEFAULT_PROJECT_ROOT): number {
	console.log('Checking documentation links...\n');

	const mdFiles = markdownFiles(projectRoot);

	// A pass over zero files is a pass earned by looking at nothing, and this gate is delivered to
	// repositories whose layouts it does not know in advance. Every carrier has at least a README,
	// so an empty scan means the exclusions swallowed the tree or the root is wrong.
	if (mdFiles.length === 0) {
		console.error(
			`[FAIL] No markdown files were found under ${projectRoot}. Every carrier has at least ` +
				'a README, so this is a wrong root or an exclusion that matched too much, not a ' +
				'repository without documentation.',
		);
		return 1;
	}

	// The first pass collects every target that resolves; the second runs only when git says one of
	// them is absent from the repository. Asking git once for the whole scan is what forces the two
	// passes, and it keeps the cost off the fast path, where nothing is ignored and the second pass
	// never happens. Targets outside the project root stay out of the question because git declines
	// to answer for them, which would fall the whole call open.
	const candidates = new Set<string>();
	const collect = (relativeTarget: string): boolean => {
		if (!relativeTarget.startsWith('..')) candidates.add(relativeTarget);
		return false;
	};
	let reports = mdFiles.map((file) => checkFile(file, projectRoot, collect));
	const ignoredTargets = gitIgnored(projectRoot, [...candidates]);
	if (ignoredTargets.size > 0)
		reports = mdFiles.map((file) =>
			checkFile(file, projectRoot, (relativeTarget) => ignoredTargets.has(relativeTarget)),
		);

	const allBroken = reports.flatMap((report) => report.broken);
	const badWaiverList = reports.flatMap((report) => report.waivers);

	// Reported before the links, and fatal on their own. A marker that cannot be honoured is a hole
	// in the gate rather than a defect in a document, so it outranks whatever it was hiding.
	if (badWaiverList.length > 0)
		reportWaivers(badWaiverList, (file) => toPosixRelative(projectRoot, file));

	if (allBroken.length === 0) {
		if (badWaiverList.length > 0) return 1;
		console.log(`[OK] All links valid across ${mdFiles.length} markdown file(s) examined`);
		return 0;
	}

	// Group by file
	const grouped = new Map<string, BrokenLink[]>();
	for (const link of allBroken) {
		const key = toPosixRelative(projectRoot, link.file);
		const existing = grouped.get(key) ?? [];
		existing.push(link);
		grouped.set(key, existing);
	}

	console.error(
		`[FAIL] Found ${allBroken.length} broken link(s) across ${grouped.size} of ` +
			`${mdFiles.length} markdown file(s) examined:\n`,
	);

	for (const [file, links] of grouped) {
		console.error(`  ${file}`);
		for (const link of links) {
			const why = link.ignored
				? '  (the target is here but git ignores it, so a fresh checkout has no such file)'
				: '';
			console.error(`    Line ${link.line}: [${link.linkText}](${link.target})${why}`);
		}
		console.error();
	}

	return 1;
}

if (import.meta.main) exit(runDocs());

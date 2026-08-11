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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { type BadWaiver, badWaivers, reportWaivers, waiverReason } from './lib/docs/waivers.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PROJECT_ROOT = resolve(__dirname, '..');

/** Directories to exclude from scanning, matched by basename at any depth */
const EXCLUDE_DIRS = new Set([
	'.aidd',
	'.claude',
	'.git',
	'.github',
	'backups',
	'coverage',
	'data',
	'dist',
	'logs',
	'node_modules',
	'screenshots',
]);

/**
 * Directories excluded by their path from the project root rather than by basename.
 *
 * These are out of scope, not waived. The distinction matters: a waiver says a known violation is
 * tolerated, and nothing here is a violation of anything. `cli/src/prompts/snapshots/` holds prompt
 * text delivered verbatim to an AI agent, and its links name files in the project being audited.
 * They are not this repository's links and were never meant to resolve here, the same way
 * `node_modules` markdown is not this repository's documentation.
 *
 * Anchored by path because the basename is too common to exclude fleetwide: `snapshots` matched
 * anywhere would silence a real docs directory that happened to share the name.
 */
const EXCLUDE_PATHS = ['cli/src/prompts/snapshots'];

/** Prefixes that indicate an external or non-file link */
const EXTERNAL_PREFIXES = ['http://', 'https://', 'mailto:', 'data:', 'tel:'];

interface BrokenLink {
	file: string;
	line: number;
	linkText: string;
	target: string;
}

/** Path from the project root, with forward slashes, so exclusions read the same on either OS. */
function toPosixRelative(projectRoot: string, path: string): string {
	return relative(projectRoot, path).split(sep).join('/');
}

/**
 * Drops the files git ignores. A doc-link checker has no business validating links inside
 * gitignored scratch or vendored trees: they are not shipped, and their markdown is frequently
 * third-party and malformed. Falls open (keeps everything) when git cannot answer — not a repo,
 * git missing — so scanning outside a repository is unchanged.
 *
 * One `--stdin` call over the whole list rather than one call per directory during the walk. The
 * per-directory form cost about nine seconds in the largest carrier, enough to exceed the default
 * per-test timeout; a file inside an ignored directory is itself ignored, so batching by file
 * gives the same answer for a single spawn.
 */
function dropGitIgnored(projectRoot: string, files: string[]): string[] {
	if (files.length === 0) return files;
	const relatives = files.map((file) => toPosixRelative(projectRoot, file));
	const result = Bun.spawnSync(['git', 'check-ignore', '-z', '--stdin'], {
		cwd: projectRoot,
		stderr: 'ignore',
		stdin: Buffer.from(`${relatives.join('\0')}\0`),
		windowsHide: true,
	});
	// 0 = some path is ignored, 1 = none are, anything else = git could not answer.
	if (result.exitCode !== 0) return files;
	const ignored = new Set(result.stdout.toString().split('\0').filter(Boolean));
	return files.filter((_, index) => !ignored.has(relatives[index]!));
}

/**
 * Recursively discover all .md files under a directory, excluding specified dirs.
 */
function findMarkdownFiles(dir: string, projectRoot: string): string[] {
	const results: string[] = [];

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (EXCLUDE_DIRS.has(entry.name)) continue;
			const full = join(dir, entry.name);
			if (EXCLUDE_PATHS.includes(toPosixRelative(projectRoot, full))) continue;
			results.push(...findMarkdownFiles(full, projectRoot));
		} else if (entry.isFile() && entry.name.endsWith('.md')) {
			results.push(join(dir, entry.name));
		}
	}

	return results;
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
 */
function checkFile(filePath: string, projectRoot: string): FileReport {
	const content = readFileSync(filePath, 'utf-8');
	const lines = content.split('\n');
	const fileDir = dirname(filePath);
	const broken: BrokenLink[] = [];
	const used = new Set<number>();

	// Match inline links: [text](path) but not images ![alt](path) which may use data URIs
	const linkRegex = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
	let inCodeBlock = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;

		// Track fenced code block state
		if (line.trimStart().startsWith('```')) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock) continue;

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

			// Resolve relative to the file's directory
			const resolved = resolve(fileDir, target);
			if (existsSync(resolved)) continue;

			// Also check if it resolves relative to project root (some docs use root-relative paths)
			if (existsSync(resolve(projectRoot, target))) continue;

			// A marker on this line or the one above suppresses it, provided it says why.
			const marker = waiverReason(line) ?? waiverReason(lines[i - 1] ?? '');
			if (marker !== null && marker.length > 0) {
				used.add(i);
				continue;
			}

			broken.push({ file: filePath, line: i + 1, linkText, target });
		}
	}

	return { broken, waivers: badWaivers(filePath, lines, used) };
}

export function runDocs(projectRoot = DEFAULT_PROJECT_ROOT): number {
	console.log('Checking documentation links...\n');

	const mdFiles = dropGitIgnored(projectRoot, findMarkdownFiles(projectRoot, projectRoot));

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

	const reports = mdFiles.map((file) => checkFile(file, projectRoot));
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
			console.error(`    Line ${link.line}: [${link.linkText}](${link.target})`);
		}
		console.error();
	}

	return 1;
}

if (import.meta.main) exit(runDocs());

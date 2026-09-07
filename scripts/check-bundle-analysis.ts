#!/usr/bin/env bun
/**
 * Rejects a bundle-composition analysis that cannot be trusted, and prints what it found.
 *
 * Enforces: WEB-001 (aidd) -- the bundled web surface stays a lean single-user control plane.
 * Aggregate and critical-path byte budgets say the panel got bigger; only per-module attribution
 * says which import did it, and an analysis produced from a different or older build attributes
 * bytes to the wrong source.
 *
 * Run: bun run check:bundle-analysis [--root <dir>]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cwd, env, exit } from 'node:process';
import { parseArgs } from 'node:util';

import { type BundleArtifact, hashBundleArtifacts } from './lib/bundle-artifact-hash.ts';

/** Written by the `aidd-bundle-analysis` plugin in frontend/vite.config.ts. */
export const ANALYSIS_DIR = join('data', 'build-analysis');
export const STATS_JSON = 'frontend-stats.json';
export const STATS_HTML = 'frontend-stats.html';
export const DIST_DIR = join('frontend', 'dist');

export interface BundleAnalysis {
	artifactHash: string;
	chunks: { bytes: number; entry: boolean; path: string }[];
	generatedAt: string;
	modules: { bytes: number; path: string }[];
	revision: string;
	version: string;
}

function isAnalysis(value: unknown): value is BundleAnalysis {
	const candidate = value as null | Partial<BundleAnalysis>;
	return (
		typeof candidate === 'object' &&
		candidate !== null &&
		Array.isArray(candidate.chunks) &&
		Array.isArray(candidate.modules) &&
		typeof candidate.artifactHash === 'string' &&
		typeof candidate.revision === 'string'
	);
}

function newestMtime(path: string): number {
	let stats;
	try {
		stats = statSync(path);
	} catch {
		return 0;
	}
	if (!stats.isDirectory()) return stats.mtimeMs;
	let newest = stats.mtimeMs;
	for (const entry of readdirSync(path, { withFileTypes: true })) {
		newest = Math.max(newest, newestMtime(join(path, entry.name)));
	}
	return newest;
}

/** The revision the current sources would build as, or null when it cannot be determined. */
export function currentRevision(root: string): null | string {
	const fromEnv = env.AIDD_BUILD_REVISION?.trim();
	if (fromEnv !== undefined && fromEnv !== '') return fromEnv.slice(0, 8).toLowerCase();
	try {
		return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			windowsHide: true,
		})
			.trim()
			.slice(0, 8)
			.toLowerCase();
	} catch {
		// No git binary and no override: the freshness checks below still apply.
		return null;
	}
}

/**
 * Whether the report describes the build sitting in frontend/dist.
 *
 * The revision cannot answer this: two dirty builds of one HEAD, or a plain `build:frontend` run
 * after the analysis, keep the revision and change the bytes, and the attribution then names
 * modules that are not in the shipped output.
 */
function artifactFindings(root: string, analysis: BundleAnalysis): string[] {
	const artifacts: BundleArtifact[] = [];
	const missing: string[] = [];

	for (const chunk of analysis.chunks) {
		const filePath = join(root, DIST_DIR, ...chunk.path.split('/'));
		try {
			artifacts.push({ bytes: readFileSync(filePath), fileName: chunk.path });
		} catch {
			missing.push(chunk.path);
		}
	}

	// One finding, not one per file: chunk names carry a content hash, so any rebuild rotates most
	// of them at once and eighty identical lines say nothing the first one does not.
	const [first, ...rest] = missing;
	if (first !== undefined) {
		const others = rest.length === 0 ? '' : ` (and ${rest.length} other chunk(s) it names)`;
		return [`${DIST_DIR}/${first} is missing${others}; rerun "bun run build:analyze"`];
	}

	if (hashBundleArtifacts(artifacts) === analysis.artifactHash) return [];
	return [
		`${ANALYSIS_DIR}/${STATS_JSON} describes a different build than ${DIST_DIR}; ` +
			'rerun "bun run build:analyze"',
	];
}

function kib(bytes: number): string {
	return `${(bytes / 1024).toFixed(1)} KiB`;
}

/** Findings for one analysis directory. Empty means the analysis is usable. */
export function inspectAnalysis(root: string, revision: null | string): string[] {
	const directory = join(root, ANALYSIS_DIR);
	const jsonPath = join(directory, STATS_JSON);
	const htmlPath = join(directory, STATS_HTML);
	const findings: string[] = [];

	if (!existsSync(jsonPath)) {
		return [`${ANALYSIS_DIR}/${STATS_JSON} is missing; run "bun run build:analyze"`];
	}
	if (!existsSync(htmlPath)) {
		findings.push(`${ANALYSIS_DIR}/${STATS_HTML} is missing; the treemap was not written`);
	} else if (statSync(htmlPath).size === 0) {
		findings.push(`${ANALYSIS_DIR}/${STATS_HTML} is empty`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
	} catch (err) {
		findings.push(
			`${ANALYSIS_DIR}/${STATS_JSON} is not readable JSON: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
		return findings;
	}
	if (!isAnalysis(parsed)) {
		findings.push(`${ANALYSIS_DIR}/${STATS_JSON} does not carry a bundle analysis`);
		return findings;
	}
	if (parsed.chunks.length === 0 || parsed.modules.length === 0) {
		findings.push(
			`${ANALYSIS_DIR}/${STATS_JSON} attributes nothing: ` +
				`${parsed.chunks.length} chunk(s), ${parsed.modules.length} module(s)`,
		);
	} else {
		findings.push(...artifactFindings(root, parsed));
	}
	if (revision !== null && parsed.revision !== revision) {
		findings.push(
			`${ANALYSIS_DIR}/${STATS_JSON} was built from revision ${parsed.revision}, ` +
				`but the tree is at ${revision}`,
		);
	}

	const newestSource = newestMtime(join(root, 'frontend', 'src'));
	if (newestSource >= statSync(jsonPath).mtimeMs) {
		findings.push(
			`${ANALYSIS_DIR}/${STATS_JSON} is older than frontend/src; rerun "bun run build:analyze"`,
		);
	}

	return findings;
}

function report(root: string): number {
	const analysis = JSON.parse(
		readFileSync(join(root, ANALYSIS_DIR, STATS_JSON), 'utf8'),
	) as BundleAnalysis;
	const total = analysis.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);

	console.log(`Chunks (${analysis.chunks.length}, ${kib(total)} total):`);
	for (const chunk of analysis.chunks.slice(0, 10)) {
		console.log(`- ${chunk.path}${chunk.entry ? ' [entry]' : ''}: ${kib(chunk.bytes)}`);
	}
	console.log(`Top modules by attributed bytes (of ${analysis.modules.length}):`);
	for (const module of analysis.modules.slice(0, 15)) {
		console.log(`- ${module.path}: ${kib(module.bytes)}`);
	}
	console.log(
		`[OK] check:bundle-analysis -- ${analysis.modules.length} module(s) examined across ` +
			`${analysis.chunks.length} chunk(s) at revision ${analysis.revision}.`,
	);
	return 0;
}

export function runBundleAnalysis(root: string = cwd()): number {
	let findings: string[];
	try {
		findings = inspectAnalysis(root, currentRevision(root));
	} catch (err) {
		console.error(
			`[FAIL] check:bundle-analysis could not run: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
		return 2;
	}

	if (findings.length > 0) {
		for (const finding of findings) console.error(`- ${finding}`);
		console.log(`[FAIL] check:bundle-analysis -- ${findings.length} finding(s).`);
		return 1;
	}

	return report(root);
}

if (import.meta.main) {
	let root: string | undefined;
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			options: { root: { type: 'string' } },
			strict: true,
		});
		root = values.root;
	} catch (err) {
		console.error(
			`[FAIL] check:bundle-analysis: ${err instanceof Error ? err.message : String(err)}`,
		);
		console.error('[FAIL] Usage: check:bundle-analysis [--root <dir>]');
		exit(2);
	}
	exit(runBundleAnalysis(root === undefined ? cwd() : resolve(root)));
}

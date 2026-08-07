#!/usr/bin/env bun
/**
 * Destructive Confirmation Check
 *
 * Enforces: ASSERT-020 (spernakit) / WEB-007 (aidd) -- destructive user actions (delete, revoke,
 * impersonate, purge) MUST require an explicit confirmation step before dispatch.
 *
 * Scans every .tsx file under `frontend/src` for destructive call sites and verifies that each one
 * has confirmation evidence the gate can resolve, or a waiver that says why it cannot.
 *
 * A destructive call site is one of two things:
 *
 * - an **inline destructive request** — a `method: 'DELETE'` option, or an endpoint literal naming
 *   a destructive verb; or
 * - a **destructive mutation dispatch** — `deleteThing.mutate(...)`, `revokeKey.mutateAsync(...)`,
 *   and the rest of the same shape.
 *
 * The second form is the one that matters, and it was missing. This gate looked only for the
 * first, and both carriers have since moved their requests behind a typed API client: the DELETE
 * now lives in `frontend/src/api/*.ts`, the mutation in `frontend/src/hooks/*.ts`, and only the
 * dispatch remains in the component. The patterns matched **zero lines in spernakit's own
 * frontend** while eight real destructive dispatches sat in it, and the gate reported `[OK]` on
 * every run. Rule 5 of `docs/reference/gate-conventions.md` exists for exactly that: a gate that
 * found nothing looks the same as a gate that looked at nothing, which is why the pass line below
 * carries the count and why zero sites in a frontend that has mutations is a failure.
 *
 * Usage:
 *   bun scripts/check-destructive-confirmation.ts
 *   bun run check:destructive-confirmation
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { hasConfirmationEvidence } from './lib/destructive/evidence.ts';
import {
	type BadWaiver,
	badWaivers,
	coveringMarker,
	reportWaivers,
	WAIVER_MARKER,
	waiverReason,
} from './lib/destructive/waivers.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PROJECT_ROOT = resolve(__dirname, '..');

const SKIP_DIRS = new Set(['.aidd', '.git', 'coverage', 'data', 'dist', 'logs', 'node_modules']);

/**
 * The verbs that make an action destructive. Unchanged from the version of this gate that only
 * read endpoint literals: this rewrite changes where the gate looks, not what it considers
 * destructive, so no call site becomes a finding because the vocabulary grew.
 */
const DESTRUCTIVE_VERBS = 'delete|remove|revoke|purge|impersonate|wipe|destroy';

const DESTRUCTIVE_PATTERNS = [
	/method:\s*['"]DELETE['"]/i,
	// Endpoint literals are matched under any API prefix. The original pattern required
	// `/api/v1/`, which is spernakit's; a gate that ships to a repository versioning its API
	// differently would have gone quiet without saying so.
	new RegExp(`['"]/[^'"]*(?:${DESTRUCTIVE_VERBS})[^'"]*['"]`, 'i'),
	new RegExp(`\\b[\\w.]*(?:${DESTRUCTIVE_VERBS})\\w*\\.(?:mutate|mutateAsync)\\s*\\(`, 'i'),
];

/** A frontend with none of these has no mutation layer, which is the one honest reason for zero. */
const MUTATION_PATTERN = /useMutation|mutate\(|mutateAsync\(/;

interface Violation {
	content: string;
	file: string;
	line: number;
}

interface FileResult {
	mutations: boolean;
	sites: number;
	violations: Violation[];
	waivers: BadWaiver[];
}

function* walkDir(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) yield* walkDir(fullPath);
		else if (entry.isFile() && entry.name.endsWith('.tsx')) yield fullPath;
	}
}

function checkFile(projectRoot: string, filePath: string): FileResult {
	const content = readFileSync(filePath, 'utf-8');
	const relativePath = relative(projectRoot, filePath).replace(/\\/g, '/');
	const lines = content.split('\n');
	const result: FileResult = { mutations: false, sites: 0, violations: [], waivers: [] };

	if (!MUTATION_PATTERN.test(content)) return result;
	result.mutations = true;

	const used = new Set<number>();
	for (const [index, line] of lines.entries()) {
		if (!line) continue;
		if (waiverReason(line) !== null) continue;
		if (!DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(line))) continue;

		result.sites += 1;
		if (hasConfirmationEvidence(lines, index)) continue;
		const marker = coveringMarker(lines, index);
		if (marker !== null) {
			used.add(marker);
			continue;
		}
		result.violations.push({ content: line.trim(), file: relativePath, line: index + 1 });
	}

	result.waivers = badWaivers(relativePath, lines, used);
	return result;
}

export function runDestructiveConfirmation(projectRoot = DEFAULT_PROJECT_ROOT): number {
	const frontendSrc = join(projectRoot, 'frontend', 'src');
	try {
		statSync(frontendSrc);
	} catch {
		console.log(
			`[SKIP] No frontend source directory at ${relative(projectRoot, frontendSrc)}.`,
		);
		return 0;
	}

	let sites = 0;
	let mutationFiles = 0;
	const violations: Violation[] = [];
	const waivers: BadWaiver[] = [];

	for (const filePath of walkDir(frontendSrc)) {
		const result = checkFile(projectRoot, filePath);
		if (result.mutations) mutationFiles += 1;
		sites += result.sites;
		violations.push(...result.violations);
		waivers.push(...result.waivers);
	}

	if (waivers.length > 0) {
		reportWaivers(waivers);
		return 1;
	}

	if (sites === 0) {
		// Rule 5. The distinction the gate can actually make is whether the frontend has a mutation
		// layer at all: none means there is nothing destructive to dispatch and the skip is true,
		// while mutations present and no destructive site among them means these patterns have
		// stopped describing this codebase. That second state is the one this gate spent releases in.
		if (mutationFiles === 0) {
			console.log('[SKIP] No mutation call sites under frontend/src.');
			return 0;
		}
		console.error(
			'[FAIL] No destructive call sites found, but frontend/src dispatches mutations.\n',
		);
		console.error(
			'  Either every destructive action was removed, or the patterns in this gate no ' +
				'longer match how this frontend dispatches one. Check the second before believing ' +
				'the first: a gate that examines nothing passes every run.',
		);
		return 1;
	}

	if (violations.length > 0) {
		console.error(
			`[FAIL] ${violations.length} destructive call site(s) with no confirmation, of ${sites} examined:\n`,
		);
		for (const violation of violations) {
			console.error(`- ${violation.file}:${violation.line} ${violation.content}`);
		}
		console.error(
			'\nDispatch a destructive action from a handler a confirmation dialog invokes, or ' +
				`mark the line with '${WAIVER_MARKER} <reason>' when the ` +
				'confirmation is real but takes a form this gate cannot see.',
		);
		return 1;
	}

	console.log(`[OK] ${sites} destructive call site(s) examined, all confirmed`);
	return 0;
}

if (import.meta.main) exit(runDestructiveConfirmation());

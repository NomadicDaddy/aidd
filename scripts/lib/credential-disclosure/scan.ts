/**
 * Shape-based detection of agent tool results that read a credential-bearing file and got content
 * back. Pure with respect to stdout and to the process: everything here takes a root and returns
 * data, so `scripts/test-credential-disclosure.ts` can point it at a fixture.
 *
 * Never prints or hashes a value. A finding names a file, a line, and which path
 * pattern matched, and nothing else -- a detector that quoted the evidence would republish it.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { commandCredentialLabel } from './command.ts';
import { hasReturnedContent, parseDisclosureRecords } from './records.ts';

/** Where retained agent artifacts accumulate. Both are gitignored and machine-local. */
export const SCAN_ROOTS = ['.aidd/iterations', 'data/run-logs'];

export const BASELINE_PATH = '.aidd/evidence/credential-disclosure-baseline.json';

const ARTIFACT_FILE = /\.(?:json|jsonl|log|ndjson)$/i;

export interface Hit {
	readonly file: string;
	readonly label: string;
	readonly line: number;
}

/** Match only the result belonging to a credential read, including interleaved tool calls. */
export function scanLines(lines: string[], file: string): Hit[] {
	const hits: Hit[] = [];
	const pending = new Map<
		string,
		{ command?: string | undefined; label: string; line: number }
	>();
	for (const record of parseDisclosureRecords(lines)) {
		const key = record.id ?? `tool:${record.tool ?? 'anonymous'}`;
		if (record.type === 'call') {
			pending.delete(key);
			if (record.label)
				pending.set(key, {
					command: record.command,
					label: record.label,
					line: record.line,
				});
			continue;
		}
		const call = pending.get(key);
		pending.delete(key);
		if (
			call &&
			hasReturnedContent(record.output) &&
			(!call.command || commandCredentialLabel(call.command, record.output))
		) {
			hits.push({ file, label: call.label, line: call.line });
		}
	}
	return hits;
}
/** Artifact files under `dir`, recursively. A missing directory contributes nothing. */
export async function walkArtifacts(dir: string, out: string[] = []): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) await walkArtifacts(full, out);
		else if (ARTIFACT_FILE.test(entry.name)) out.push(full);
	}
	return out;
}

export interface Baseline {
	readonly files: string[];
	readonly generatedAt: string;
	/** Mandatory. `loadBaseline` refuses a baseline without one -- see gate-conventions rule 7. */
	readonly reason: string;
}

export interface ScanReport {
	/** Baselined files that no longer disclose, so the baseline can only shrink. */
	readonly cleared: string[];
	readonly disclosing: string[];
	readonly examined: number;
	readonly regressions: Hit[];
}

/**
 * Read the baseline, or `undefined` when there is none. Throws when one exists but carries no
 * reason: a reasonless waiver is indistinguishable from an oversight and never gets removed.
 */
export async function loadBaseline(root: string): Promise<Baseline | undefined> {
	let text: string;
	try {
		text = await readFile(join(root, BASELINE_PATH), 'utf8');
	} catch {
		return undefined;
	}
	const parsed = JSON.parse(text) as Partial<Baseline>;
	if (typeof parsed.reason !== 'string' || parsed.reason.trim() === '') {
		throw new Error(
			`${BASELINE_PATH} has no \`reason\`. A waiver without one is an oversight.`,
		);
	}
	return {
		files: parsed.files ?? [],
		generatedAt: parsed.generatedAt ?? '',
		reason: parsed.reason,
	};
}

/** Scan every artifact under `root` and classify the hits against `baseline`. */
export async function collectDisclosures(root: string, baseline?: Baseline): Promise<ScanReport> {
	const files: string[] = [];
	for (const scanRoot of SCAN_ROOTS) await walkArtifacts(join(root, scanRoot), files);

	const hits: Hit[] = [];
	for (const file of files) {
		// Artifacts run to tens of megabytes; skipping the biggest would skip the worst offenders,
		// so read them but hold only the hits.
		const relPath = relative(root, file).split('\\').join('/');
		hits.push(...scanLines((await readFile(file, 'utf8')).split('\n'), relPath));
	}

	const disclosing = [...new Set(hits.map((hit) => hit.file))].sort();
	const known = new Set(baseline?.files ?? []);
	const stillDisclosing = new Set(disclosing);
	return {
		cleared: [...known].filter((file) => !stillDisclosing.has(file)).sort(),
		disclosing,
		examined: files.length,
		regressions: hits.filter((hit) => !known.has(hit.file)),
	};
}

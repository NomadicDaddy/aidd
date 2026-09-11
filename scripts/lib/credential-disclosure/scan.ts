/**
 * Shape-based detection of agent tool results that read a credential-bearing file and got content
 * back. Pure with respect to stdout and to the process: everything here takes a root and returns
 * data, so `scripts/test-credential-disclosure.ts` can point it at a fixture.
 *
 * Never inspects, prints, or hashes a value. A finding names a file, a line, and which path
 * pattern matched, and nothing else -- a detector that quoted the evidence would republish it.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** Where retained agent artifacts accumulate. Both are gitignored and machine-local. */
export const SCAN_ROOTS = ['.aidd/iterations', 'data/run-logs'];

export const BASELINE_PATH = '.aidd/evidence/credential-disclosure-baseline.json';

/**
 * Paths whose contents are credentials. Each is matched against the raw artifact text, so it has
 * to tolerate every spelling an agent might have typed and every escaping the transport applied:
 * `~`, `$HOME`, `%USERPROFILE%`, a literal absolute path, forward or backslashes, and backslashes
 * doubled by one or two rounds of JSON encoding.
 *
 * The separator class absorbs the doubling. Requiring `.aidd` immediately before `config.json`
 * keeps a project's `.aidd/aidd.config.json` out of it: that file carries no credentials and is
 * read constantly. The dotenv pattern likewise skips the committed templates (`.env.example` and
 * its siblings): they document which variables exist and never hold a value.
 */
export const CREDENTIAL_PATHS: { label: string; pattern: RegExp }[] = [
	{ label: 'aidd user config', pattern: /\.aidd[/\\]+config\.json/i },
	{ label: 'ssh private key material', pattern: /\.ssh[/\\]+id_[a-z0-9]+/i },
	{ label: 'aws credentials', pattern: /\.aws[/\\]+credentials/i },
	{ label: 'netrc', pattern: /[/\\]\.netrc\b/i },
	{ label: 'npmrc', pattern: /[/\\]\.npmrc\b/i },
	{
		label: 'dotenv',
		pattern: /[/\\]\.env(?:\.(?!(?:dist|example|sample|template)\b)[a-z]+)?["'\s]/i,
	},
];

/**
 * A record that carries content back from a tool, across the three transcript protocols aidd
 * retains: native/zrun (`tool_result`), Codex (`aggregated_output` inside a completed
 * `command_execution`), and Claude (`tool_result` / `tool_use_result`).
 */
const RESULT_RECORD = /"(?:tool_result|aggregated_output|tool_use_result)"/;

/**
 * A Codex `file_change` record lists the paths an edit wrote. It carries no content and has no
 * result of its own, so letting it arm the call/result pairing would blame whatever unrelated
 * command output happened to come next.
 */
const WRITE_RECORD = /"type":"file_change"/;

/** How much content counts as "something came back" rather than an empty read. */
const MIN_DISCLOSED_BYTES = 40;

/** String literals in a JSON record, so a record can be judged by what it actually carries. */
const STRING_LITERAL = /"(?:[^"\\]|\\.)*"/g;

/**
 * Whether a result record carries a substantial payload, measured as its longest string value.
 *
 * The whole line's length will not do: `{"type":"tool_result","tool":"read_file","result":""}` is
 * fifty bytes of envelope around nothing, so a read that returned empty would read as a
 * disclosure. The longest literal is what separates the two, and it works across all three
 * transcript protocols without knowing which field each one puts the content in.
 */
function carriesContent(line: string): boolean {
	for (const literal of line.match(STRING_LITERAL) ?? []) {
		if (literal.length - 2 > MIN_DISCLOSED_BYTES) return true;
	}
	return false;
}

const ARTIFACT_FILE = /\.(?:json|jsonl|log|ndjson)$/i;

export interface Hit {
	readonly file: string;
	readonly label: string;
	readonly line: number;
}

/**
 * Codex packs the command and its output into one record, so a single line can prove disclosure.
 * The native and Claude protocols split them: the path appears in a `tool_call`/`tool_use` line
 * and the content arrives in the next result line. Pairing across that gap is what makes the
 * check work on all three, and the pending flag is cleared by the first result line either way --
 * a read that returned nothing leaves no hit.
 */
export function scanLines(lines: string[], file: string): Hit[] {
	const hits: Hit[] = [];
	let pending: { label: string; line: number } | undefined;

	lines.forEach((line, index) => {
		const matched = CREDENTIAL_PATHS.find(({ pattern }) => pattern.test(line));
		const isResult = RESULT_RECORD.test(line);

		if (matched && isResult) {
			// Same-line command-and-output (Codex). Disclosure is proven by this record alone.
			if (carriesContent(line)) {
				hits.push({ file, label: matched.label, line: index + 1 });
			}
			pending = undefined;
			return;
		}
		if (matched && !WRITE_RECORD.test(line)) {
			pending = { label: matched.label, line: index + 1 };
			return;
		}
		if (pending && isResult) {
			if (carriesContent(line)) {
				hits.push({ file, label: pending.label, line: pending.line });
			}
			pending = undefined;
		}
	});

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

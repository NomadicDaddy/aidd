import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IterationRecord } from '../iterations.ts';

import { scrubSecretFields, scrubSecrets } from '../../lib/secretScrubber.ts';
import {
	type FindingLedgerEvent,
	type FindingLedgerEventInput,
	findingLedgerEventKey,
	findingLedgerEventSchema,
	type FindingLedgerRead,
} from '../findings-ledger.ts';

async function nextIterationIndex(iterationsDir: string): Promise<number> {
	let entries: string[];
	try {
		entries = await readdir(iterationsDir);
	} catch {
		return 1;
	}
	const indexes = entries
		.map((entry) => entry.match(/^(\d+)\.log$/)?.[1])
		.filter((value): value is string => value !== undefined)
		.map((value) => Number(value))
		.filter(Number.isInteger);
	return indexes.length === 0 ? 1 : Math.max(...indexes) + 1;
}

export async function writeIteration(
	metadataDir: string,
	record: IterationRecord,
): Promise<number> {
	const iterationsDir = join(metadataDir, 'iterations');
	await mkdir(iterationsDir, { recursive: true });
	const index = record.index ?? (await nextIterationIndex(iterationsDir));
	const stem = String(index).padStart(3, '0');
	// The transcript is raw backend output: every file the agent read and every command it echoed
	// lands here verbatim, `.env` included. Live console text is already scrubbed on its way out by
	// StreamingSecretScrubber, but this file is written from the accumulated record and bypassed
	// that pass entirely — an audit found a still-valid GitHub PAT in 17 iteration logs of one
	// project. Scrub at the only choke point every iteration artifact goes through.
	await writeFile(join(iterationsDir, `${stem}.log`), scrubSecrets(record.log));
	if (record.structured) {
		await writeFile(
			join(iterationsDir, `${stem}.json`),
			`${JSON.stringify(scrubSecretFields(record.structured), null, 2)}\n`,
		);
	}
	return index;
}

export async function appendRunSummary(
	metadataDir: string,
	summary: Record<string, unknown>,
): Promise<void> {
	await mkdir(metadataDir, { recursive: true });
	await appendFile(join(metadataDir, 'runs.jsonl'), `${JSON.stringify(summary)}\n`);
}

const LEDGER_FILE = 'findings-ledger.jsonl';

/**
 * Append one lifecycle event. Idempotent on findingLedgerEventKey: when a line with the same
 * (runId, fingerprint, event, featureId) already exists, nothing is written and the original
 * line keeps its timestamp. Reads the ledger first, which is O(n) per append; the file is a
 * per-project list of finding transitions, not a log, so that is cheap where it matters.
 */
export async function appendFindingEvent(
	metadataDir: string,
	event: FindingLedgerEventInput,
): Promise<void> {
	const parsed = findingLedgerEventSchema.parse({ at: new Date().toISOString(), ...event });
	const key = findingLedgerEventKey(parsed);
	const existing = await readFindingEvents(metadataDir);
	if (existing.events.some((entry) => findingLedgerEventKey(entry) === key)) return;
	await mkdir(metadataDir, { recursive: true });
	// A torn trailing line carries no newline; appending straight after it would fuse the new
	// event into that line and lose both. Start every record on its own line.
	const separator = existing.endsWithNewline ? '' : '\n';
	await appendFile(join(metadataDir, LEDGER_FILE), `${separator}${JSON.stringify(parsed)}\n`);
}

/**
 * Read the ledger tolerantly. A torn trailing line (the process died mid-append) or a
 * hand-edited line must not take every later audit run down with it: such lines are skipped
 * and counted so the caller can say so in its summary. Only a missing file is silent.
 */
export async function readFindingEvents(metadataDir: string): Promise<FindingLedgerRead> {
	let content: string;
	try {
		content = await readFile(join(metadataDir, LEDGER_FILE), 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return { endsWithNewline: true, events: [], skippedLines: 0 };
		}
		throw error;
	}
	const events: FindingLedgerEvent[] = [];
	let skippedLines = 0;
	for (const line of content.split(/\r?\n/u)) {
		if (line.trim().length === 0) continue;
		try {
			events.push(findingLedgerEventSchema.parse(JSON.parse(line)));
		} catch {
			skippedLines++;
		}
	}
	return {
		endsWithNewline: content.length === 0 || content.endsWith('\n'),
		events,
		skippedLines,
	};
}

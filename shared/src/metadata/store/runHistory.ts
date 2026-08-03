import { appendFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IterationRecord } from '../iterations.ts';

import { scrubSecrets } from '../../lib/secretScrubber.ts';

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

// Walks the structured sidecar so each string is scrubbed in place rather than scrubbing the
// serialized JSON. Redacting after serialization can eat a closing quote out of an escaped value
// and leave the file unparseable; the readers in log-extract.ts parse this file on every report.
function scrubStructured(value: unknown): unknown {
	if (typeof value === 'string') return scrubSecrets(value);
	if (Array.isArray(value)) return value.map(scrubStructured);
	if (value && typeof value === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			result[key] = scrubStructured(entry);
		}
		return result;
	}
	return value;
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
			`${JSON.stringify(scrubStructured(record.structured), null, 2)}\n`,
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

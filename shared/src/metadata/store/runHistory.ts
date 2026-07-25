import { appendFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IterationRecord } from '../iterations.ts';

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
	await writeFile(join(iterationsDir, `${stem}.log`), record.log);
	if (record.structured) {
		await writeFile(
			join(iterationsDir, `${stem}.json`),
			`${JSON.stringify(record.structured, null, 2)}\n`,
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

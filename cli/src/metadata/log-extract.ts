import type { AiddExecutionMode, AiddTriumvirateRoles } from 'aidd-shared/execution-mode';

import { metadataPath } from 'aidd-shared/metadata/paths';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ExtractedIteration {
	backend?: string;
	commands?: string[];
	commitsCreatedCount?: number;
	durationMs?: number;
	endedAt?: string;
	errors?: { message: string; type: string }[];
	executionMode?: AiddExecutionMode;
	exitCode?: number;
	featureDescription?: string;
	featureSlug?: string;
	filesCreated?: string[];
	filesCreatedCount?: number;
	filesEdited?: string[];
	filesEditedCount?: number;
	filesRead?: string[];
	iteration: number;
	metrics?: Record<string, unknown>;
	mode?: string;
	model?: string;
	outcome?: { exitCode: number; status: string };
	promptType?: string;
	provider?: null | string;
	reasoningEffort?: string;
	residualDirtyFilesCount?: number;
	source?: string;
	startedAt?: string;
	summary?: Record<string, unknown>;
	triumvirateRoles?: AiddTriumvirateRoles;
}

const passThroughKeys: (keyof ExtractedIteration)[] = [
	'iteration',
	'startedAt',
	'endedAt',
	'durationMs',
	'backend',
	'executionMode',
	'mode',
	'model',
	'provider',
	'reasoningEffort',
	'source',
	'promptType',
	'featureSlug',
	'featureDescription',
	'exitCode',
	'outcome',
	'filesRead',
	'filesEdited',
	'filesCreated',
	'filesEditedCount',
	'filesCreatedCount',
	'commitsCreatedCount',
	'residualDirtyFilesCount',
	'commands',
	'errors',
	'metrics',
	'triumvirateRoles',
];

function reshape(record: Record<string, unknown>): ExtractedIteration {
	const passedEntries = passThroughKeys
		.map((key) => [key, record[key]] as const)
		.filter((entry): entry is readonly [keyof ExtractedIteration, unknown] => {
			return entry[1] !== undefined;
		});
	const passed = Object.fromEntries(passedEntries) as Partial<ExtractedIteration>;
	const detailsSummary = record['detailsSummary'];
	const result: ExtractedIteration = { iteration: 0, ...passed };
	if (typeof detailsSummary === 'object' && detailsSummary !== null) {
		result.summary = detailsSummary as Record<string, unknown>;
	}
	return result;
}

async function listIterationJsonFiles(projectDir: string): Promise<string[]> {
	const dir = metadataPath(projectDir, 'iterations');
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return [];
	}
	return entries
		.filter((entry) => /^\d+\.json$/.test(entry))
		.sort()
		.map((entry) => join(dir, entry));
}

async function readIterationJson(path: string): Promise<ExtractedIteration | undefined> {
	let raw: string;
	try {
		raw = await readFile(path, 'utf8');
	} catch (err) {
		if (
			typeof err === 'object' &&
			err !== null &&
			'code' in err &&
			(err as { code: unknown }).code === 'ENOENT'
		) {
			return undefined;
		}
		console.warn(
			`log-extract: failed to read iteration file ${path}: ${err instanceof Error ? err.message : String(err)}`,
		);
		return undefined;
	}
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null) return undefined;
		return reshape(parsed as Record<string, unknown>);
	} catch (err) {
		console.warn(
			`log-extract: failed to parse iteration JSON ${path}: ${err instanceof Error ? err.message : String(err)}`,
		);
		return undefined;
	}
}

export async function extractLatestIteration(
	projectDir: string,
): Promise<ExtractedIteration | undefined> {
	const files = await listIterationJsonFiles(projectDir);
	const last = files.at(-1);
	if (!last) return undefined;
	return await readIterationJson(last);
}

export async function extractAllIterations(projectDir: string): Promise<ExtractedIteration[]> {
	const files = await listIterationJsonFiles(projectDir);
	const results: ExtractedIteration[] = [];
	for (const file of files) {
		const record = await readIterationJson(file);
		if (record) results.push(record);
	}
	return results;
}

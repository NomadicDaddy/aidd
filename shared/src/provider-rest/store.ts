import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import { writeFileAtomic } from '../lib/atomicWrite.ts';
import { type BackendName, backendNames } from '../plan/types.ts';
import { activeRests, AUTO_REST_BACKENDS, type ProviderRest } from './decide.ts';

/**
 * Rest state lives in `<dataDir>/provider-rest/<backend>.json`, read by the CLI and the web panel
 * alike. One file per backend, so a rate limit resting codex and a person resting grok at the same
 * moment write different files instead of racing over one shared document. Each write is atomic.
 */
export function providerRestDir(dataDir: string): string {
	return join(dataDir, 'provider-rest');
}

function restFile(dataDir: string, backend: BackendName): string {
	return join(providerRestDir(dataDir), `${backend}.json`);
}

const restSchema = z
	.object({
		backend: z.enum(backendNames),
		reason: z.string(),
		setAt: z.string(),
		source: z.enum(['manual', 'rate_limit']),
		until: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
	})
	.strict();

async function readRest(dataDir: string, backend: BackendName): Promise<ProviderRest | undefined> {
	let text: string;
	try {
		text = await readFile(restFile(dataDir, backend), 'utf8');
	} catch {
		return undefined;
	}
	// A file that does not parse, or names another backend, is ignored rather than trusted: a rest
	// only ever withholds a backend, so reading a damaged one as "not resting" keeps launches going.
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return undefined;
	}
	const parsed = restSchema.safeParse(raw);
	if (!parsed.success || parsed.data.backend !== backend) return undefined;
	return parsed.data;
}

/** Every rest that has not ended yet. */
export async function readProviderRests(
	dataDir: string,
	now: Date = new Date(),
): Promise<ProviderRest[]> {
	const rests: ProviderRest[] = [];
	for (let i = 0; i < backendNames.length; i++) {
		const backend = backendNames[i] as BackendName;
		const rest = await readRest(dataDir, backend);
		if (rest !== undefined) rests.push(rest);
	}
	return activeRests(rests, now);
}

export async function writeProviderRest(dataDir: string, rest: ProviderRest): Promise<void> {
	await mkdir(providerRestDir(dataDir), { recursive: true });
	const body = JSON.stringify(rest, null, '\t');
	await writeFileAtomic(restFile(dataDir, rest.backend), `${body}\n`);
}

export async function clearProviderRest(dataDir: string, backend: BackendName): Promise<void> {
	await rm(restFile(dataDir, backend), { force: true });
}

/**
 * Rests a subscription backend after a rate limit reported when it resets. Returns the rest now in
 * force, or undefined when this backend never rests on its own. A rest already running longer is
 * kept as it is: a rate limit may extend a rest but never shortens one a person set.
 */
export async function restFromRateLimit(
	dataDir: string,
	backend: BackendName,
	until: Date,
	now: Date = new Date(),
): Promise<ProviderRest | undefined> {
	if (!AUTO_REST_BACKENDS.includes(backend)) return undefined;
	if (until.getTime() <= now.getTime()) return undefined;
	const current = await readRest(dataDir, backend);
	if (current !== undefined && Date.parse(current.until) >= until.getTime()) return current;
	const rest: ProviderRest = {
		backend,
		reason: 'rate limit',
		setAt: now.toISOString(),
		source: 'rate_limit',
		until: until.toISOString(),
	};
	await writeProviderRest(dataDir, rest);
	return rest;
}

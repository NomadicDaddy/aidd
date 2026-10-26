import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

type FoldReason = 'eligible' | 'invalid-id' | 'not-completed' | 'not-passing' | 'source-changed';

export interface FoldEligibility {
	eligible: boolean;
	id: null | string;
	passes: boolean;
	reason: FoldReason;
	sha256: string;
	status: null | string;
}

function validateExpectedHash(expectedSha256: string | undefined): void {
	if (expectedSha256 !== undefined && !/^[a-f\d]{64}$/i.test(expectedSha256)) {
		throw new Error('Expected SHA256 must contain exactly 64 hexadecimal characters');
	}
}

export function assessFoldSource(bytes: Uint8Array, expectedSha256?: string): FoldEligibility {
	validateExpectedHash(expectedSha256);
	let value: unknown;
	try {
		value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
	} catch {
		throw new Error('Fold source must be valid UTF-8 JSON');
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error('Fold source must be a feature JSON object');
	}
	const record = value as Record<string, unknown>;
	const sha256 = createHash('sha256').update(bytes).digest('hex');
	const id = typeof record.id === 'string' && record.id.trim() ? record.id : null;
	const status = typeof record.status === 'string' ? record.status : null;
	const passes = record.passes === true;
	const reason: FoldReason =
		expectedSha256 !== undefined && sha256 !== expectedSha256.toLowerCase()
			? 'source-changed'
			: id === null
				? 'invalid-id'
				: status !== 'completed'
					? 'not-completed'
					: !passes
						? 'not-passing'
						: 'eligible';
	return { eligible: reason === 'eligible', id, passes, reason, sha256, status };
}

export async function checkFoldSource(
	source: string,
	expectedSha256?: string,
): Promise<FoldEligibility> {
	validateExpectedHash(expectedSha256);
	const entry = await lstat(source);
	if (!entry.isFile() || entry.isSymbolicLink()) {
		throw new Error('Fold source must be a regular file');
	}
	return assessFoldSource(await readFile(source), expectedSha256);
}

export async function main(argv: string[]): Promise<number> {
	try {
		const { values } = parseArgs({
			args: argv,
			options: {
				'expect-sha256': { type: 'string' },
				snapshot: { type: 'boolean' },
				source: { type: 'string' },
			},
			strict: true,
		});
		if (!values.source?.trim()) throw new Error('A source feature file is required');
		const snapshot = values.snapshot === true;
		if (snapshot === (values['expect-sha256'] !== undefined)) {
			throw new Error('Choose snapshot capture or verification with an expected SHA256');
		}
		const result = await checkFoldSource(values.source, values['expect-sha256']);
		console.log(JSON.stringify({ ...result, mode: snapshot ? 'snapshot' : 'verification' }));
		return result.eligible ? 0 : 1;
	} catch {
		// Parsing errors can quote source text. Keep failure output independent of file values.
		console.error('Fold source check failed: unreadable/invalid source or invalid arguments.');
		return 1;
	}
}

if (import.meta.main) process.exit(await main(Bun.argv.slice(2)));

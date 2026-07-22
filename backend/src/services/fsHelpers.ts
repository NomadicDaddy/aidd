import type { Stats } from 'node:fs';

import { readFile, stat } from 'node:fs/promises';

import { recordDataMovement } from './dataMovementTrace.ts';

function isEnoent(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: unknown }).code === 'ENOENT'
	);
}

export async function readTextOrNull(path: string): Promise<null | string> {
	try {
		const text = await readFile(path, 'utf8');
		recordDataMovement({
			category: 'file',
			operation: 'read.text',
			status: 'hit',
			summary: { bytes: text.length },
			target: path,
		});
		return text;
	} catch (err) {
		if (isEnoent(err)) {
			recordDataMovement({
				category: 'file',
				operation: 'read.text',
				status: 'miss',
				target: path,
			});
			return null;
		}
		recordDataMovement({
			category: 'file',
			operation: 'read.text',
			status: 'error',
			summary: { message: err instanceof Error ? err.message : String(err) },
			target: path,
		});
		throw err;
	}
}

export async function readJsonOrNull<T>(path: string): Promise<null | T> {
	const raw = await readTextOrNull(path);
	if (raw === null) return null;
	try {
		const parsed = JSON.parse(raw) as T;
		recordDataMovement({
			category: 'metadata',
			operation: 'parse.json',
			status: 'success',
			target: path,
		});
		return parsed;
	} catch {
		recordDataMovement({
			category: 'metadata',
			operation: 'parse.json',
			status: 'error',
			target: path,
		});
		return null;
	}
}

export async function statOrNull(path: string): Promise<null | Stats> {
	try {
		const value = await stat(path);
		recordDataMovement({
			category: 'file',
			operation: 'stat',
			status: 'hit',
			summary: { bytes: value.size, isDirectory: value.isDirectory() },
			target: path,
		});
		return value;
	} catch (err) {
		if (isEnoent(err)) {
			recordDataMovement({
				category: 'file',
				operation: 'stat',
				status: 'miss',
				target: path,
			});
			return null;
		}
		recordDataMovement({
			category: 'file',
			operation: 'stat',
			status: 'error',
			summary: { message: err instanceof Error ? err.message : String(err) },
			target: path,
		});
		throw err;
	}
}

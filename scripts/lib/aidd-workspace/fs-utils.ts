import { readFile, stat } from 'node:fs/promises';

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (err) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return false;
		throw err;
	}
}

export async function pathIsDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch (err) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return false;
		throw err;
	}
}

export async function readJsonObject(path: string): Promise<Record<string, unknown>> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(path, 'utf8'));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid JSON at ${path}: ${message}`, { cause: err });
	}
	if (!isObject(parsed)) throw new Error(`Expected JSON object at ${path}`);
	return parsed;
}

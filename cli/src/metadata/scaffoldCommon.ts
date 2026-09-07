import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { pathExists } from './scaffoldFs.ts';

const COPY_RETRY_ATTEMPTS = 5;
const COPY_RETRY_BASE_DELAY_MS = 25;
const RETRYABLE_COPY_CODES = new Set(['EACCES', 'EBUSY', 'EPERM']);

export async function copyCommonModules(rootDir: string, aiddDir: string): Promise<void> {
	const source = join(rootDir, 'prompts', '_common');
	if (!(await pathExists(source))) return;
	const target = join(aiddDir, '_common');
	await mkdir(target, { recursive: true });
	await copyTreeIfChanged(source, target);
}

// The _common tree is static template content read by the running agent (e.g.
// project-overrides.md). Re-copying identical bytes on every CLI startup opened each
// destination for write while a concurrent run held it open for read, share-violating on
// Windows (EBUSY/EPERM). Copy only files that are missing or differ, and tolerate the rare
// transient lock on a genuinely changed file with a bounded retry.
export async function copyTreeIfChanged(sourceDir: string, targetDir: string): Promise<void> {
	const entries = await readdir(sourceDir, { withFileTypes: true });
	for (const entry of entries) {
		const source = join(sourceDir, entry.name);
		const target = join(targetDir, entry.name);
		if (entry.isDirectory()) {
			await mkdir(target, { recursive: true });
			await copyTreeIfChanged(source, target);
			continue;
		}
		if (!entry.isFile()) continue;
		if (await isUnchangedCopy(source, target)) continue;
		await copyFileWithRetry(source, target);
	}
}

async function isUnchangedCopy(source: string, target: string): Promise<boolean> {
	try {
		const [sourceBytes, targetBytes] = await Promise.all([readFile(source), readFile(target)]);
		return sourceBytes.equals(targetBytes);
	} catch {
		return false;
	}
}

export async function copyFileWithRetry(source: string, target: string): Promise<void> {
	for (let attempt = 1; ; attempt += 1) {
		try {
			await cp(source, target, { dereference: true, force: true });
			return;
		} catch (err) {
			if (attempt >= COPY_RETRY_ATTEMPTS || !isRetryableCopyError(err)) throw err;
			await delay(COPY_RETRY_BASE_DELAY_MS * attempt);
		}
	}
}

function isRetryableCopyError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const code = (error as { code?: unknown }).code;
	return typeof code === 'string' && RETRYABLE_COPY_CODES.has(code);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

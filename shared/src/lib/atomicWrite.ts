import { rename, rm, writeFile } from 'node:fs/promises';

// Windows refuses a rename over a file another process has open (a reader, an indexer, antivirus).
// Short retries outlast an ordinary read; a target that stays held is written in place instead.
const RENAME_RETRIES = 8;
const TRANSIENT_RENAME_CODES = new Set(['EACCES', 'EBUSY', 'EPERM']);

function isTransientRenameError(error: unknown): boolean {
	return TRANSIENT_RENAME_CODES.has((error as NodeJS.ErrnoException).code ?? '');
}

async function renameWithRetry(from: string, to: string): Promise<boolean> {
	for (let attempt = 1; ; attempt++) {
		try {
			await rename(from, to);
			return true;
		} catch (error) {
			if (!isTransientRenameError(error)) throw error;
			if (attempt >= RENAME_RETRIES) return false;
			await Bun.sleep(25 * attempt);
		}
	}
}

/**
 * Replace `target` with `content` so a reader sees the old file or the new one, never a torn mix: the
 * content goes to a unique temp file beside it, then renames over it. A crash mid-write leaves the
 * old file intact, and a failed write removes its temp file. The temp name carries pid, time and a
 * random part, so concurrent writers of one target never share it.
 *
 * When Windows keeps the target held past the retries, the content is written in place, as it was
 * before this helper existed: a write that used to succeed must not start failing.
 */
export async function writeFileAtomic(target: string, content: string): Promise<void> {
	const unique = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
	const tmp = `${target}.${process.pid}.${Date.now()}.${unique}.tmp`;
	try {
		await writeFile(tmp, content);
		if (await renameWithRetry(tmp, target)) return;
		await writeFile(target, content);
	} catch (error) {
		await rm(tmp, { force: true });
		throw error;
	}
	await rm(tmp, { force: true });
}

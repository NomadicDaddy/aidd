import { rename, rm, writeFile } from 'node:fs/promises';

// Windows refuses a rename over a file another process has open (a reader, an indexer, antivirus).
// Retries with a growing pause (about 1.6 s in all) outlast an ordinary read.
const RENAME_RETRIES = 12;
const TRANSIENT_RENAME_CODES = new Set(['EACCES', 'EBUSY', 'EPERM']);

function isTransientRenameError(error: unknown): boolean {
	return TRANSIENT_RENAME_CODES.has((error as NodeJS.ErrnoException).code ?? '');
}

async function renameWithRetry(from: string, to: string): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		try {
			await rename(from, to);
			return;
		} catch (error) {
			if (!isTransientRenameError(error) || attempt >= RENAME_RETRIES) throw error;
			await Bun.sleep(25 * attempt);
		}
	}
}

/**
 * Replace `target` with `content` so a reader sees the old file or the new one, never a torn mix: the
 * content goes to a unique temp file beside it, then renames over it. The temp name carries pid,
 * time and a random part, so concurrent writers of one target never share it.
 *
 * A write that cannot land, including a target Windows keeps held past the retries, throws and
 * leaves the old file intact with no temp file behind. It never falls back to writing the target in
 * place: that is the truncate-then-write window this helper exists to close.
 */
export async function writeFileAtomic(target: string, content: string): Promise<void> {
	const unique = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
	const tmp = `${target}.${process.pid}.${Date.now()}.${unique}.tmp`;
	try {
		await writeFile(tmp, content);
		await renameWithRetry(tmp, target);
	} catch (error) {
		await rm(tmp, { force: true });
		throw error;
	}
}

import { rm } from 'node:fs/promises';

// Removes a directory tree, retrying on transient Windows file-lock errors. A just-exited
// subprocess (an agent's editor, a git child) can still hold a handle on a file under the tree
// for several seconds, so a bare `rm` throws EBUSY/ENOTEMPTY/EPERM. Retry with backoff so cleanup
// outlasts the handle release. Promoted from the test helper so production worktree teardown can
// share it.
export async function removeTempTree(path: string): Promise<void> {
	for (let attempt = 0; attempt < 40; attempt++) {
		try {
			await rm(path, { force: true, recursive: true });
			return;
		} catch (error) {
			const code =
				typeof error === 'object' && error !== null && 'code' in error
					? String(error.code)
					: undefined;
			if (code !== 'EBUSY' && code !== 'ENOTEMPTY' && code !== 'EPERM') throw error;
			await Bun.sleep(100);
		}
	}
	await rm(path, { force: true, recursive: true });
}

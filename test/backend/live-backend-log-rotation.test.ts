import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { open, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { rotateLiveBackendLog } from '../../backend/src/services/backendLogRotation.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

test('rotates a backend log while its append descriptor remains open', async () => {
	const dir = await testTempDir('aidd-live-log-rotation-');
	const path = join(dir, 'backend.log');
	try {
		await writeFile(path, '12345678');
		const descriptor = await open(path, 'a');
		try {
			expect(await rotateLiveBackendLog(dir, 'backend.log', 8)).toBe(true);
			await descriptor.write('next');
		} finally {
			await descriptor.close();
		}
		expect(await readFile(join(dir, 'backend.log.1'), 'utf8')).toBe('12345678');
		expect(await readFile(path, 'utf8')).toBe('next');
		expect((await stat(path)).size).toBe(4);
		expect(existsSync(join(dir, 'backend.log.2'))).toBe(false);
	} finally {
		await removeTempTree(dir);
	}
});

import { type ResolvedWebConfig } from 'aidd-shared/config';
import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureSpernakitCheckout } from '../../backend/src/services/project/spernakitCheckout.ts';
import { defaultWebConfig } from '../../shared/src/config/defaults.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function stubGenerator(dir: string): Promise<void> {
	await mkdir(join(dir, 'scripts'), { recursive: true });
	await writeFile(join(dir, 'scripts', 'init.ts'), '// stub generator', 'utf8');
}

describe('ensureSpernakitCheckout', () => {
	test('clones into the cache on first use, then reuses it', async () => {
		const tmpDir = await testTempDir('aidd-spernakit-checkout-clone-');
		const dataDir = join(tmpDir, 'data');
		await mkdir(dataDir, { recursive: true });
		const config: ResolvedWebConfig = {
			...defaultWebConfig,
			dataDir,
			spernakitInitScript: null,
		};

		let cloneCount = 0;
		const clone = async (_config: ResolvedWebConfig, targetDir: string): Promise<void> => {
			cloneCount++;
			await stubGenerator(targetDir);
		};

		const first = await ensureSpernakitCheckout(config, clone);
		expect(first).toBe(join(dataDir, 'templates', 'spernakit'));
		expect(cloneCount).toBe(1);

		// A second call reuses the cached checkout without re-cloning.
		const second = await ensureSpernakitCheckout(config, clone);
		expect(second).toBe(first);
		expect(cloneCount).toBe(1);
	});

	test('uses the configured checkout directory and never clones', async () => {
		const tmpDir = await testTempDir('aidd-spernakit-checkout-cfg-');
		const checkout = join(tmpDir, 'spernakit');
		await stubGenerator(checkout);
		const script = join(checkout, 'init.ps1');
		await writeFile(script, '# marker', 'utf8');
		const config: ResolvedWebConfig = {
			...defaultWebConfig,
			dataDir: join(tmpDir, 'data'),
			spernakitInitScript: script,
		};

		const resolved = await ensureSpernakitCheckout(config, () => {
			throw new Error('should not clone when a checkout is configured');
		});
		expect(resolved).toBe(checkout);
	});

	test('rejects a configured checkout that has no generator', async () => {
		const tmpDir = await testTempDir('aidd-spernakit-checkout-nogen-');
		const checkout = join(tmpDir, 'spernakit');
		await mkdir(checkout, { recursive: true });
		const script = join(checkout, 'init.ps1');
		await writeFile(script, '# marker', 'utf8');
		const config: ResolvedWebConfig = {
			...defaultWebConfig,
			dataDir: join(tmpDir, 'data'),
			spernakitInitScript: script,
		};

		await expect(ensureSpernakitCheckout(config, async () => {})).rejects.toThrow(
			/no scripts\/init\.ts/,
		);
	});
});

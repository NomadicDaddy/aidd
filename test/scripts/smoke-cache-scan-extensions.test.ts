import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { collectDependencies } from '../../scripts/lib/smoke-cache/collect.ts';
import { testTempDir } from '../_helpers/temp.ts';

test.each(['backend/src', 'cli/src', 'shared/src', 'scripts'])(
	'cache inputs cover every scanned source extension in %s',
	async (directory) => {
		const root = await testTempDir('scan-extension-cache-');
		await mkdir(join(root, directory), { recursive: true });
		const files = ['ts', 'tsx', 'js', 'mjs', 'cjs'].map(
			(extension) => `${directory}/example.${extension}`,
		);
		for (const file of files) await writeFile(join(root, file), 'export {};\n');
		const envInputs = await collectDependencies(root, 'check:env-spread');
		const lineInputs = await collectDependencies(root, 'check:max-lines');
		for (const file of files) expect(envInputs).toContain(file);
		expect(lineInputs).toContain(`${directory}/example.tsx`);
	},
);

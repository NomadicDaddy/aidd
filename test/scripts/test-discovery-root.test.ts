import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

import { buildProjectCommandEnv } from '../../shared/src/subprocess-env.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function runDiscovery(root: string): Promise<{ code: number; output: string }> {
	const child = Bun.spawn([process.execPath, 'test'], {
		cwd: root,
		env: buildProjectCommandEnv(),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const [code, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { code, output: stdout + stderr };
}

test('default discovery runs maintained tests and preload without executing a runtime checkout', async () => {
	const root = await testTempDir('aidd-discovery-root-');
	try {
		const config = await readFile(new URL('../../bunfig.toml', import.meta.url), 'utf8');
		await mkdir(join(root, 'test/backend'), { recursive: true });
		await mkdir(join(root, 'test/cli'), { recursive: true });
		await mkdir(join(root, 'data/worktrees/foreign/test'), { recursive: true });
		await writeFile(join(root, 'bunfig.toml'), config);
		await writeFile(
			join(root, 'test/test-run-lock.preload.ts'),
			"await Bun.write('preload-ran', 'yes');\n",
		);
		for (const [area, extension] of [
			['backend', 'test'],
			['cli', 'spec'],
		] as const) {
			await writeFile(
				join(root, `test/${area}/owned.${extension}.ts`),
				`import { expect, test } from 'bun:test';\n` +
					`test('owned-${area}', () => expect(process.cwd()).toBe(${JSON.stringify(root)}));\n`,
			);
		}
		await writeFile(
			join(root, 'data/worktrees/foreign/test/foreign.test.ts'),
			"await Bun.write('foreign-executed', 'yes'); throw new Error('foreign checkout executed');\n",
		);

		const bounded = await runDiscovery(root);
		expect(bounded.code).toBe(0);
		expect(bounded.output).toContain('2 pass');
		expect(await readFile(join(root, 'preload-ran'), 'utf8')).toBe('yes');
		expect(await Bun.file(join(root, 'foreign-executed')).exists()).toBe(false);

		// Positive control: the previous configuration discovers and executes the nested checkout.
		await writeFile(join(root, 'bunfig.toml'), config.replace(/^root = .*\r?\n/m, ''));
		const unbounded = await runDiscovery(root);
		expect(unbounded.code).not.toBe(0);
		expect(unbounded.output).toContain('foreign checkout executed');
		expect(await readFile(join(root, 'foreign-executed'), 'utf8')).toBe('yes');
	} finally {
		await removeTempTree(root);
	}
});

import { expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

test('rendered CLI help documents every accepted handler flag', async () => {
	const handlers = join(import.meta.dir, '../../shared/src/args/parse-impl/handlers');
	const flags = new Set<string>();
	for (const name of await readdir(handlers)) {
		if (!name.endsWith('.ts')) continue;
		const source = await readFile(join(handlers, name), 'utf8');
		for (const match of source.matchAll(/case '(--[a-z][a-z-]*)':/g)) {
			if (match[1]) flags.add(match[1]);
		}
	}
	expect(flags.size).toBeGreaterThan(60);
	const child = Bun.spawn([process.execPath, 'run', 'start', '--', '--help'], {
		cwd: join(import.meta.dir, '../..'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const [help, errors, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	expect({ errors: exitCode === 0 ? '' : errors, exitCode }).toEqual({ errors: '', exitCode: 0 });
	const documented = new Set(help.match(/--[a-z][a-z-]*/g));
	expect([...flags].filter((flag) => !documented.has(flag))).toEqual([]);
});

import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const provider = resolve(import.meta.dir, '../../backend/src/services/terminal/ptyProvider.ts');

// A child process, because bun-pty loads its library once, at import, and the provider memoizes.
const CHILD = `
const { loadPtyProvider } = await import(${JSON.stringify(provider)});
const spawn = await loadPtyProvider();
if (spawn === null) {
	console.log('RESULT unavailable');
	process.exit(0);
}
const pty = spawn(process.execPath, ['--version'], {
	cols: 80,
	cwd: process.cwd(),
	env: { ...process.env },
	rows: 24,
});
pty.onExit((event) => {
	console.log('RESULT exit ' + String(event.exitCode));
	process.exit(0);
});
`;

async function runChild(libPath?: string): Promise<string> {
	const env: Record<string, string | undefined> = { ...process.env }; // allow-env-spread-policy
	if (libPath === undefined) delete env['BUN_PTY_LIB'];
	else env['BUN_PTY_LIB'] = libPath;
	const child = Bun.spawn([process.execPath, '-e', CHILD], {
		env,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const [out] = await Promise.all([new Response(child.stdout).text(), child.exited]);
	return /RESULT (.+)/.exec(out)?.[1]?.trim() ?? `no result: ${out.slice(0, 200)}`;
}

describe('loadPtyProvider', () => {
	test('a host whose native library cannot load reports the terminal unavailable', async () => {
		// An existing file that isn't a library: bun-pty finds it and dlopen refuses it.
		expect(await runChild(resolve(import.meta.dir, '../../package.json'))).toBe('unavailable');
	});

	test('a working host gets a spawn that really runs a program', async () => {
		expect(await runChild()).toBe('exit 0');
	});
});

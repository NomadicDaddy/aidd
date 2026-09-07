import { join } from 'node:path';

// Reproduces the leaked-verification-server shape from build-proof (e): an agent-side
// intermediate (shell/start-script) spawns a listening server that outlives it. The grandchild
// writes {pid, port} to an info file once it is listening; the intermediate then lingers briefly
// (so pid/ppid snapshots can link the chain) and exits, orphaning the listener.

export const grandchildScript = `
const infoPath = process.argv[2];
const server = Bun.serve({ fetch: () => new Response('ok'), port: 0 });
await Bun.write(infoPath, JSON.stringify({ pid: process.pid, port: server.port }));
setInterval(() => {}, 60_000);
// Safety self-exit so a failing test never leaks a listener for long.
setTimeout(() => process.exit(0), 60_000);
`;

export const intermediateScript = `
const [grandchildPath, infoPath] = process.argv.slice(2);
const bun = process.execPath.replaceAll('\\\\', '/');
if (process.platform === 'win32') {
	// Start-Process escapes Bun's job object the same way real leaked verification servers do
	// (anything still job-bound dies with the CLI anyway). The trailing sleep keeps the pwsh
	// intermediate alive long enough for a pid/ppid snapshot to link the chain.
	Bun.spawnSync([
		'pwsh', '-NoProfile', '-NonInteractive', '-Command',
		"Start-Process -WindowStyle Hidden -FilePath '" + bun + "' -ArgumentList @('run','" +
			grandchildPath.replaceAll('\\\\', '/') + "','" + infoPath.replaceAll('\\\\', '/') +
			"'); Start-Sleep -Seconds 4",
	]);
} else {
	const child = Bun.spawn([process.execPath, 'run', grandchildPath, infoPath], {
		detached: true, stderr: 'ignore', stdin: 'ignore', stdout: 'ignore',
	});
	child.unref();
	await Bun.sleep(2500);
}
`;

export interface LeakFixturePaths {
	grandchildPath: string;
	infoPath: string;
	intermediatePath: string;
}

export interface LeakedServerInfo {
	pid: number;
	port: number;
}

export async function writeLeakFixture(dir: string): Promise<LeakFixturePaths> {
	const paths: LeakFixturePaths = {
		grandchildPath: join(dir, 'grandchild.ts'),
		infoPath: join(dir, 'info.json'),
		intermediatePath: join(dir, 'intermediate.ts'),
	};
	await Bun.write(paths.grandchildPath, grandchildScript);
	await Bun.write(paths.intermediatePath, intermediateScript);
	return paths;
}

export async function readLeakedServerInfo(
	infoPath: string,
): Promise<LeakedServerInfo | undefined> {
	const file = Bun.file(infoPath);
	if (!(await file.exists())) return undefined;
	try {
		return (await file.json()) as LeakedServerInfo;
	} catch {
		return undefined; // partially written
	}
}

export async function pollFor<T>(
	read: () => Promise<T | undefined>,
	timeoutMs: number,
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const value = await read();
		if (value !== undefined) return value;
		await Bun.sleep(100);
	}
	throw new Error('pollFor timed out');
}

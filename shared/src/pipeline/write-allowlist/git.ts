async function readProcessText(stream: ReadableStream<Uint8Array>): Promise<string> {
	return new Response(stream).text();
}

export async function gitCapture(projectDir: string, args: string[]): Promise<null | string> {
	try {
		const proc = Bun.spawn(['git', ...args], {
			cwd: projectDir,
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const [stdout, code] = await Promise.all([readProcessText(proc.stdout), proc.exited]);
		return code === 0 ? stdout : null;
	} catch {
		return null;
	}
}

export async function gitHead(projectDir: string): Promise<string | undefined> {
	const out = await gitCapture(projectDir, ['rev-parse', '--verify', 'HEAD']);
	return out?.trim() || undefined;
}

export async function gitStatusEntries(projectDir: string): Promise<Map<string, string> | null> {
	try {
		const proc = Bun.spawn(['git', 'status', '--porcelain=v1', '--untracked-files=all'], {
			cwd: projectDir,
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const [stdout, code] = await Promise.all([readProcessText(proc.stdout), proc.exited]);
		if (code !== 0) return null;
		const entries = new Map<string, string>();
		for (const line of stdout.split('\n')) {
			if (line.length < 4) continue;
			const status = line.slice(0, 2);
			let path = line.slice(3);
			const arrow = path.indexOf(' -> ');
			if (arrow !== -1) path = path.slice(arrow + 4);
			if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
			if (path.length > 0) entries.set(path, status);
		}
		return entries;
	} catch {
		return null;
	}
}

export async function committedPathsSince(
	projectDir: string,
	baselineHead: string | undefined
): Promise<string[]> {
	const currentHead = await gitHead(projectDir);
	if (currentHead === undefined || currentHead === baselineHead) return [];
	const range = baselineHead
		? `${baselineHead}..${currentHead}`
		: '4b825dc642cb6eb9a060e54bf8d69288fbee4904..HEAD';
	const out = await gitCapture(projectDir, ['diff', '--name-only', range]);
	if (out === null) return [];
	return out.split('\n').filter((line) => line.length > 0);
}

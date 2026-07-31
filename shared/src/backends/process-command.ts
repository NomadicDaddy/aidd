import { existsSync } from 'node:fs';
import { delimiter, isAbsolute, resolve, sep } from 'node:path';

const WIN_PATHEXT_EXTENSIONS = [
	'.COM',
	'.EXE',
	'.BAT',
	'.CMD',
	'.VBS',
	'.VBE',
	'.JS',
	'.JSE',
	'.WSF',
	'.WSH',
	'.MSC',
];

/**
 * Resolve a command for Bun.spawn without shell:true.
 * On non-Windows, returns the command unchanged.
 * On Windows, if the command is absolute or contains a path separator and exists, returns it unchanged.
 * Otherwise, searches PATH entries combined with PATHEXT extensions using synchronous fs checks,
 * falling back to the original command if nothing resolves.
 */
export function resolveCommand(command: string): string {
	if (process.platform !== 'win32') return command;
	if (isAbsolute(command) || command.includes(sep)) {
		return command;
	}
	const pathEnv = process.env.PATH ?? '';
	const pathExt = process.env.PATHEXT ?? '';
	const exts = pathExt ? pathExt.split(';').filter((e) => e.length > 0) : WIN_PATHEXT_EXTENSIONS;
	for (const dir of pathEnv.split(delimiter)) {
		if (!dir) continue;
		for (const ext of exts) {
			const candidate = resolve(dir, command + ext);
			if (existsSync(candidate)) return candidate;
		}
	}
	return command;
}

export function shouldDetachProcessBackend(platform: NodeJS.Platform = process.platform): boolean {
	return platform !== 'win32';
}

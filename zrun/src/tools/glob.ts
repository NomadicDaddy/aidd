import { Glob as BunGlob } from 'bun';

interface GlobArgs {
	pattern: string;
	path?: string;
}

export async function glob(args: GlobArgs, cwd: string): Promise<string> {
	const searchPath = args.path ?? cwd;
	const resolvedPath =
		searchPath.startsWith('/') || searchPath.match(/^[A-Za-z]:/)
			? searchPath
			: `${cwd}/${searchPath}`;

	try {
		const g = new BunGlob(args.pattern);
		const matches: string[] = [];

		for await (const file of g.scan({ cwd: resolvedPath, dot: false })) {
			matches.push(file);
			if (matches.length >= 500) break;
		}

		if (matches.length === 0) {
			return 'No files found matching pattern.';
		}

		let result = matches.join('\n');
		if (matches.length >= 500) {
			result += '\n... (results capped at 500 files)';
		}
		return result;
	} catch (err) {
		return `ERROR: Glob failed: ${err instanceof Error ? err.message : String(err)}`;
	}
}

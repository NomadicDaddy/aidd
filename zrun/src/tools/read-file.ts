import { readFileSync, existsSync } from 'fs';

interface ReadFileArgs {
	path: string;
	offset?: number;
	limit?: number;
}

export function readFile(args: ReadFileArgs, cwd: string): string {
	const filePath =
		args.path.startsWith('/') || args.path.match(/^[A-Za-z]:/)
			? args.path
			: `${cwd}/${args.path}`;

	if (!existsSync(filePath)) {
		return `ERROR: File not found: ${filePath}`;
	}

	try {
		const content = readFileSync(filePath, 'utf-8');
		const lines = content.split('\n');
		const offset = args.offset ?? 0;
		const limit = args.limit ?? Math.min(lines.length, 2000);
		const slice = lines.slice(offset, offset + limit);

		let result = slice
			.map((line, i) => `${String(offset + i + 1).padStart(6)}| ${line}`)
			.join('\n');

		if (result.length > 100_000) {
			result = result.substring(0, 100_000) + `\n... (file output truncated at 100k chars)`;
		}

		if (lines.length > offset + limit) {
			result += `\n(showing lines ${offset + 1}-${offset + limit} of ${lines.length} total)`;
		}

		return result;
	} catch (err) {
		return `ERROR: Failed to read file: ${err instanceof Error ? err.message : String(err)}`;
	}
}

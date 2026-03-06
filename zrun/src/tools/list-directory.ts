import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

interface ListDirectoryArgs {
	path: string;
}

export function listDirectory(args: ListDirectoryArgs, cwd: string): string {
	const dirPath =
		args.path.startsWith('/') || args.path.match(/^[A-Za-z]:/)
			? args.path
			: `${cwd}/${args.path}`;

	if (!existsSync(dirPath)) {
		return `ERROR: Directory not found: ${dirPath}`;
	}

	try {
		const entries = readdirSync(dirPath);
		const formatted = entries.map((name) => {
			try {
				const stat = statSync(join(dirPath, name));
				return stat.isDirectory() ? `${name}/` : name;
			} catch {
				return name;
			}
		});

		if (formatted.length === 0) {
			return '(empty directory)';
		}

		return formatted.join('\n');
	} catch (err) {
		return `ERROR: Failed to list directory: ${err instanceof Error ? err.message : String(err)}`;
	}
}

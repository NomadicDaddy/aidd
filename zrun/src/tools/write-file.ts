import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

interface WriteFileArgs {
	path: string;
	content: string;
}

export function writeFile(args: WriteFileArgs, cwd: string): string {
	const filePath =
		args.path.startsWith('/') || args.path.match(/^[A-Za-z]:/)
			? args.path
			: `${cwd}/${args.path}`;

	try {
		mkdirSync(dirname(filePath), { recursive: true });
		writeFileSync(filePath, args.content, 'utf-8');
		return `File written successfully: ${filePath}`;
	} catch (err) {
		return `ERROR: Failed to write file: ${err instanceof Error ? err.message : String(err)}`;
	}
}

import { readFileSync, writeFileSync, existsSync } from 'fs';

interface EditFileArgs {
	path: string;
	old_string: string;
	new_string: string;
}

export function editFile(args: EditFileArgs, cwd: string): string {
	const filePath =
		args.path.startsWith('/') || args.path.match(/^[A-Za-z]:/)
			? args.path
			: `${cwd}/${args.path}`;

	if (!existsSync(filePath)) {
		return `ERROR: File not found: ${filePath}`;
	}

	try {
		const content = readFileSync(filePath, 'utf-8');
		const idx = content.indexOf(args.old_string);

		if (idx === -1) {
			return `ERROR: old_string not found in file. Ensure exact match including whitespace and indentation.`;
		}

		// Replace only the first occurrence
		const newContent =
			content.substring(0, idx) +
			args.new_string +
			content.substring(idx + args.old_string.length);
		writeFileSync(filePath, newContent, 'utf-8');

		return `File edited successfully: ${filePath}`;
	} catch (err) {
		return `ERROR: Failed to edit file: ${err instanceof Error ? err.message : String(err)}`;
	}
}

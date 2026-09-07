export const readToolPattern = /^(read_file|read|view|cat_file)$/i;
export const writeToolPattern = /^(write_file|write|create_file|new_file)$/i;
export const editToolPattern = /^(edit_file|edit|str_replace|str_replace_editor|replace_in_file)$/i;
export const bashToolPattern = /^(bash|shell|terminal|run_command|execute|exec)$/i;

// Backends report the same tool under different casings/aliases (bash/Bash,
// Read/read_file). Mixed casing broke downstream JSON consumers (PowerShell
// ConvertFrom-Json treats keys case-insensitively and collides bash/Bash).
// Collapse known families to a canonical bucket and lowercase the rest.
export function canonicalToolName(tool: string): string {
	if (bashToolPattern.test(tool)) return 'bash';
	if (readToolPattern.test(tool)) return 'read';
	if (writeToolPattern.test(tool)) return 'write';
	if (editToolPattern.test(tool)) return 'edit';
	return tool.toLowerCase();
}

export function pathFromArgs(args: unknown): string | undefined {
	if (typeof args !== 'object' || args === null) return undefined;
	const record = args as Record<string, unknown>;
	for (const key of ['file_path', 'path', 'filePath', 'target_file', 'filename']) {
		const value = record[key];
		if (typeof value === 'string' && value.length > 0) return value;
	}
	return undefined;
}

export function commandFromArgs(args: unknown): string | undefined {
	if (typeof args !== 'object' || args === null) return undefined;
	const record = args as Record<string, unknown>;
	for (const key of ['command', 'cmd', 'script']) {
		const value = record[key];
		if (typeof value === 'string' && value.length > 0) return value;
	}
	return undefined;
}

// The per-call working directory, for the shell tools that accept one. Backends that confine every
// command to the run's own cwd report nothing here, so callers must treat it as optional.
export function cwdFromArgs(args: unknown): string | undefined {
	if (typeof args !== 'object' || args === null) return undefined;
	const record = args as Record<string, unknown>;
	for (const key of ['cwd', 'workdir', 'working_directory', 'workingDirectory', 'directory']) {
		const value = record[key];
		if (typeof value === 'string' && value.length > 0) return value;
	}
	return undefined;
}

import { gitOutput } from './git-exec.ts';

export interface FileChanges {
	filesCreated: string[];
	filesEdited: string[];
}

// Files the iteration's own commits touched, split by git's add/modify status. Backends that do
// their file work through the shell — codex runs every edit as a bash command — emit no Write/Edit
// tool events at all, so an iteration that landed seven files across two commits recorded
// `filesEdited: []` and a run detail page showing a run that touched nothing. Git is the ground
// truth for what was actually written; used only as a fallback when the backend reported nothing,
// so backends that do report file activity keep their own (broader) accounting.
export async function gitCommitsFileChanges(
	projectDir: string,
	hashes: readonly string[],
): Promise<FileChanges> {
	const created = new Set<string>();
	const edited = new Set<string>();
	for (const hash of hashes) {
		const output = await gitOutput(projectDir, [
			'show',
			'--name-status',
			'--format=',
			'--no-renames',
			hash,
		]);
		if (!output) continue;
		for (const rawLine of output.split(/\r?\n/)) {
			const line = rawLine.trim();
			if (!line) continue;
			const [status, ...pathParts] = line.split('\t');
			const path = pathParts.join('\t').replace(/^"|"$/g, '');
			if (!path || !status) continue;
			// A path added by one commit and modified by a later one stays a creation.
			if (status.startsWith('A')) created.add(path);
			else if (status.startsWith('D')) continue;
			else edited.add(path);
		}
	}
	return {
		filesCreated: [...created],
		filesEdited: [...edited].filter((path) => !created.has(path)),
	};
}

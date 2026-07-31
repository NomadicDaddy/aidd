import { HttpError } from '../errors.ts';
import { readWorkingTree, type WorkingTreeFile, type WorkingTreeResult } from './workingTree.ts';

// Every mutating working-tree route resolves its requested paths through here first.
//
// The client may only name paths that git currently reports as changed. That is the security
// boundary for the destructive actions: `discard` deletes untracked files off disk, so accepting an
// arbitrary client-supplied path would turn the endpoint into a file-deletion primitive over
// anything reachable from the project directory. Matching against the live listing means the blast
// radius is exactly "files git already says are dirty", with no path-traversal parsing to get wrong.

export const maxSelectedPaths = 500;

export interface WorkingTreeSelection {
	/** The matched listing entries, in the order git reported them. */
	entries: WorkingTreeFile[];
	/** Every pathspec the action should pass to git, including pre-rename paths. */
	pathspecs: string[];
	/** The listing the selection was resolved against. */
	tree: WorkingTreeResult;
}

export async function resolveWorkingTreeSelection(
	projectDir: string,
	requested: string[],
): Promise<WorkingTreeSelection> {
	if (requested.length === 0) throw new HttpError('No paths were selected.', 400);
	const tree = await readWorkingTree(projectDir);
	if (tree.state !== 'ok') {
		throw new HttpError(tree.reason ?? 'The working tree could not be read.', 409);
	}

	const byPath = new Map(tree.files.map((file) => [file.path, file]));
	const entries: WorkingTreeFile[] = [];
	const unknown: string[] = [];
	const seen = new Set<string>();
	for (const path of requested) {
		if (seen.has(path)) continue;
		seen.add(path);
		const entry = byPath.get(path);
		if (entry) entries.push(entry);
		else unknown.push(path);
	}
	if (unknown.length > 0) {
		const preview = unknown.slice(0, 5).join(', ');
		const suffix = unknown.length > 5 ? `, and ${unknown.length - 5} more` : '';
		throw new HttpError(
			`These paths are no longer reported as changed — refresh and try again: ${preview}${suffix}`,
			409,
		);
	}

	// A staged rename needs both halves on the command line: the new path alone leaves the old path
	// staged as a deletion, so a "discard" would silently keep half the change.
	const pathspecs: string[] = [];
	for (const entry of entries) {
		pathspecs.push(entry.path);
		if (entry.origPath) pathspecs.push(entry.origPath);
	}
	return { entries, pathspecs, tree };
}

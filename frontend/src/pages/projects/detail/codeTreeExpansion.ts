// Expansion state for the code file tree. A directory's default is closed unless it leads to the
// selected file; the user's explicit open/collapse choices are stored as per-path overrides so a
// folder on the selected file's path can still be collapsed (an override beats the
// reveal-the-selection default, which a plain expanded-set cannot express).
export type DirExpansionOverrides = ReadonlyMap<string, boolean>;

// Directory paths that contain the given file path, from the shallowest to the deepest. For
// `src/pages/Code.tsx` this yields `['src', 'src/pages']`. Used to reveal the selected file by
// expanding only the folders on the way down to it while the rest of the tree stays collapsed.
export function ancestorDirs(filePath: null | string): string[] {
	if (!filePath) return [];
	const segments = filePath.split('/');
	const dirs: string[] = [];
	let current = '';
	for (let index = 0; index < segments.length - 1; index += 1) {
		current = current ? `${current}/${segments[index]}` : (segments[index] ?? '');
		dirs.push(current);
	}
	return dirs;
}

// Whether a directory renders open: an active search keeps every folder open so matches stay
// visible; otherwise the user's explicit choice wins, and absent one the folder is open only when
// it leads to the selected file.
export function isDirExpanded(
	dirPath: string,
	overrides: DirExpansionOverrides,
	selectedAncestors: ReadonlySet<string>,
	searching: boolean,
): boolean {
	if (searching) return true;
	return overrides.get(dirPath) ?? selectedAncestors.has(dirPath);
}

// Record a click on a directory row: the folder flips from whatever it currently shows as
// (override or selection default), so a folder held open by the selected file collapses on the
// first click instead of needing the selection to move first.
export function toggleDir(
	dirPath: string,
	overrides: DirExpansionOverrides,
	selectedAncestors: ReadonlySet<string>,
): DirExpansionOverrides {
	const next = new Map(overrides);
	next.set(dirPath, !isDirExpanded(dirPath, overrides, selectedAncestors, false));
	return next;
}

// When the selection moves to a new file, drop collapse overrides on its ancestors so the file is
// revealed even if the user had previously collapsed one of those folders (e.g. collapsed it, then
// picked a file inside it from search results). Explicit opens are kept.
export function revealSelection(
	overrides: DirExpansionOverrides,
	selectedPath: null | string,
): DirExpansionOverrides {
	const dirs = ancestorDirs(selectedPath);
	if (!dirs.some((dir) => overrides.get(dir) === false)) return overrides;
	const next = new Map(overrides);
	for (const dir of dirs) {
		if (next.get(dir) === false) next.delete(dir);
	}
	return next;
}

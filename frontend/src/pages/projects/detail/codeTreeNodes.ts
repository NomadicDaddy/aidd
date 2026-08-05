import type { ProjectCodeFileEntry } from '../../../api/types.ts';

export interface TreeDirNode {
	children: Map<string, TreeNode>;
	kind: 'dir';
	name: string;
	path: string;
}

export interface TreeFileNode {
	file: ProjectCodeFileEntry;
	kind: 'file';
	name: string;
	path: string;
}

export type TreeNode = TreeDirNode | TreeFileNode;

/**
 * How many children one directory renders before it is summarised. The cap used to be applied to the
 * flat file list *before* the tree was built, which meant any file past the 500th was viewable from a
 * link but had no row to select or highlight — the tree and the viewer showed different worlds.
 */
export const maxChildrenPerDir = 200;

export function matchesQuery(file: ProjectCodeFileEntry, query: string): boolean {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return true;
	return (
		file.path.toLowerCase().includes(normalized) ||
		(file.language ?? '').toLowerCase().includes(normalized)
	);
}

// Build a nested directory tree from the flat list of tracked-file paths. Path segments are
// split on '/'; each intermediate segment becomes a directory node and the final segment a file.
export function buildTree(files: ProjectCodeFileEntry[]): TreeDirNode {
	const root: TreeDirNode = { children: new Map(), kind: 'dir', name: '', path: '' };
	for (const file of files) {
		const segments = file.path.split('/');
		let current = root;
		for (let index = 0; index < segments.length; index += 1) {
			const segment = segments[index] ?? '';
			const isLeaf = index === segments.length - 1;
			if (isLeaf) {
				current.children.set(segment, {
					file,
					kind: 'file',
					name: segment,
					path: file.path,
				});
				continue;
			}
			const dirPath = current.path ? `${current.path}/${segment}` : segment;
			const existing = current.children.get(segment);
			let next: TreeDirNode;
			if (existing && existing.kind === 'dir') {
				next = existing;
			} else {
				next = { children: new Map(), kind: 'dir', name: segment, path: dirPath };
				current.children.set(segment, next);
			}
			current = next;
		}
	}
	return root;
}

// Sort a directory's children: directories first, then files, each alphabetically (case-insensitive).
export function sortedChildren(node: TreeDirNode): TreeNode[] {
	return [...node.children.values()].sort((left, right) => {
		if (left.kind !== right.kind) return left.kind === 'dir' ? -1 : 1;
		return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
	});
}

/** The children a directory actually renders, plus how many were left out. */
export function cappedChildren(node: TreeDirNode): { hidden: number; shown: TreeNode[] } {
	const all = sortedChildren(node);
	return {
		hidden: Math.max(0, all.length - maxChildrenPerDir),
		shown: all.slice(0, maxChildrenPerDir),
	};
}

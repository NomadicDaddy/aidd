import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { default as FileText } from 'lucide-react/dist/esm/icons/file-text';
import { default as Folder } from 'lucide-react/dist/esm/icons/folder';
import { default as FolderOpen } from 'lucide-react/dist/esm/icons/folder-open';
import { useMemo, useState } from 'react';

import type { ProjectCodeFileEntry } from '../../../api/types.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { cn } from '../../../lib/cn.ts';
import { formatBytes } from '../../../lib/formatters.ts';
import {
	ancestorDirs,
	type DirExpansionOverrides,
	isDirExpanded,
	revealSelection,
	toggleDir,
} from './codeTreeExpansion.ts';

const maxVisibleFiles = 500;

function matchesQuery(file: ProjectCodeFileEntry, query: string): boolean {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return true;
	return (
		file.path.toLowerCase().includes(normalized) ||
		(file.language ?? '').toLowerCase().includes(normalized)
	);
}

interface TreeDirNode {
	children: Map<string, TreeNode>;
	kind: 'dir';
	name: string;
	path: string;
}

interface TreeFileNode {
	file: ProjectCodeFileEntry;
	kind: 'file';
	name: string;
	path: string;
}

type TreeNode = TreeDirNode | TreeFileNode;

// Build a nested directory tree from the flat list of tracked-file paths. Path segments are
// split on '/'; each intermediate segment becomes a directory node and the final segment a file.
function buildTree(files: ProjectCodeFileEntry[]): TreeDirNode {
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
function sortedChildren(node: TreeDirNode): TreeNode[] {
	return [...node.children.values()].sort((left, right) => {
		if (left.kind !== right.kind) return left.kind === 'dir' ? -1 : 1;
		return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
	});
}

function FileTreeNode({
	depth,
	expanded,
	node,
	onSelect,
	onToggleDir,
	selectedPath,
}: {
	depth: number;
	expanded: (dirPath: string) => boolean;
	node: TreeNode;
	onSelect: (path: string) => void;
	onToggleDir: (dirPath: string) => void;
	selectedPath: null | string;
}) {
	const indent = { paddingLeft: `${0.5 + depth * 0.85}rem` };
	if (node.kind === 'dir') {
		const isOpen = expanded(node.path);
		return (
			<>
				<button
					className="flex w-full items-center gap-1.5 border-b border-neutral-100 py-1.5 pr-3 text-left text-neutral-700 transition-colors last:border-b-0 hover:bg-teal-50/60 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none dark:border-neutral-900 dark:text-neutral-300 dark:hover:bg-teal-950/20"
					onClick={() => onToggleDir(node.path)}
					style={indent}
					type="button">
					<ChevronRight
						className={cn(
							'h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform',
							isOpen && 'rotate-90',
						)}
					/>
					{isOpen ? (
						<FolderOpen className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
					) : (
						<Folder className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
					)}
					<span className="truncate font-mono text-xs">{node.name}</span>
				</button>
				{isOpen
					? sortedChildren(node).map((child) => (
							<FileTreeNode
								depth={depth + 1}
								expanded={expanded}
								key={child.path}
								node={child}
								onSelect={onSelect}
								onToggleDir={onToggleDir}
								selectedPath={selectedPath}
							/>
						))
					: null}
			</>
		);
	}
	const selected = selectedPath === node.path;
	return (
		<button
			className={cn(
				'flex w-full items-center gap-2 border-b border-neutral-100 py-1.5 pr-3 text-left transition-colors last:border-b-0 hover:bg-teal-50/60 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none dark:border-neutral-900 dark:hover:bg-teal-950/20',
				selected
					? 'bg-teal-50 text-teal-950 dark:bg-teal-950/30 dark:text-teal-100'
					: 'text-neutral-700 dark:text-neutral-300',
			)}
			onClick={() => onSelect(node.path)}
			style={indent}
			type="button">
			<FileText className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
			<span className="flex min-w-0 flex-1 items-baseline gap-2">
				<span className="truncate font-mono text-xs">{node.name}</span>
				<span className="shrink-0 text-[0.7rem] text-neutral-500 dark:text-neutral-400">
					{formatBytes(node.file.sizeBytes)}
				</span>
			</span>
		</button>
	);
}

// Renders the tracked-file list as a collapsible directory tree. Folders sort before files and
// start collapsed except for the folders leading to the selected file; an active search keeps every
// matching folder open so results stay visible.
export function CodeFileTree({
	files,
	onSelect,
	query,
	selectedPath,
}: {
	files: ProjectCodeFileEntry[];
	onSelect: (path: string) => void;
	query: string;
	selectedPath: null | string;
}) {
	const filtered = useMemo(
		() => files.filter((file) => matchesQuery(file, query)),
		[files, query],
	);
	const visible = filtered.slice(0, maxVisibleFiles);
	const tree = useMemo(() => buildTree(visible), [visible]);
	const searching = query.trim().length > 0;

	// The user's explicit open/collapse choices per directory. The tree starts collapsed except for
	// the folders leading to the selected file; an override wins over that default, so those folders
	// stay collapsible while the file remains selected.
	const [overrides, setOverrides] = useState<DirExpansionOverrides>(() => new Map());
	// When the selection moves to a new file, drop collapse overrides on its ancestors so the newly
	// selected file is revealed. Render-time state adjustment keyed on the previous selection.
	const [revealedPath, setRevealedPath] = useState<null | string>(selectedPath);
	if (revealedPath !== selectedPath) {
		setRevealedPath(selectedPath);
		setOverrides((previous) => revealSelection(previous, selectedPath));
	}
	const selectedAncestors = useMemo(() => new Set(ancestorDirs(selectedPath)), [selectedPath]);
	const onToggleDir = (dirPath: string) => {
		setOverrides((previous) => toggleDir(dirPath, previous, selectedAncestors));
	};
	const isExpanded = (dirPath: string) =>
		isDirExpanded(dirPath, overrides, selectedAncestors, searching);

	if (filtered.length === 0) {
		return <EmptyState>No tracked files match the current search.</EmptyState>;
	}
	return (
		<div className="space-y-2">
			<div className="max-h-[34rem] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
				{sortedChildren(tree).map((child) => (
					<FileTreeNode
						depth={0}
						expanded={isExpanded}
						key={child.path}
						node={child}
						onSelect={onSelect}
						onToggleDir={onToggleDir}
						selectedPath={selectedPath}
					/>
				))}
			</div>
			{filtered.length > visible.length ? (
				<p className="text-xs text-amber-700 dark:text-amber-400">
					Showing {visible.length.toLocaleString()} of {filtered.length.toLocaleString()}{' '}
					matches.
				</p>
			) : null}
		</div>
	);
}

import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { default as FileText } from 'lucide-react/dist/esm/icons/file-text';
import { default as Folder } from 'lucide-react/dist/esm/icons/folder';
import { default as FolderOpen } from 'lucide-react/dist/esm/icons/folder-open';
import { useMemo, useState } from 'react';

import type { ProjectCodeFileEntry } from '../../../api/types.ts';
import type { TreeNode } from './codeTreeNodes.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { cn } from '../../../lib/cn.ts';
import { formatBytes } from '../../../lib/formatters.ts';
import { toneText } from '../../../lib/tones.ts';
import { touchTargetRowClass } from '../../../lib/touchTarget.ts';
import { codeBrowserScrollerClass } from './codeBrowserHeight.ts';
import {
	ancestorDirs,
	type DirExpansionOverrides,
	isDirExpanded,
	revealSelection,
	toggleDir,
} from './codeTreeExpansion.ts';
import { handleTreeKeyDown } from './codeTreeKeyboard.ts';
import { buildTree, cappedChildren, matchesQuery, sortedChildren } from './codeTreeNodes.ts';

// One row treatment for both kinds. The per-row `border-b` is gone: ~500 full-width hairlines inside
// a bordered box inside a bordered pane fought the indentation that actually conveys the hierarchy.
const rowClass = `flex w-full items-center gap-1.5 rounded-sm py-1.5 pr-3 text-left transition-colors hover:bg-accent-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none ${touchTargetRowClass}`;

function FileTreeNode({
	depth,
	expanded,
	node,
	onSelect,
	onToggleDir,
	selectedPath,
	tabbablePath,
}: {
	depth: number;
	expanded: (dirPath: string) => boolean;
	node: TreeNode;
	onSelect: (path: string) => void;
	onToggleDir: (dirPath: string) => void;
	selectedPath: null | string;
	tabbablePath: null | string;
}) {
	const indent = { paddingLeft: `${0.5 + depth * 0.85}rem` };
	if (node.kind === 'dir') {
		const isOpen = expanded(node.path);
		const groupId = `code-tree-group-${node.path}`;
		const { hidden, shown } = cappedChildren(node);
		return (
			<>
				<button
					aria-expanded={isOpen}
					aria-level={depth + 1}
					aria-owns={isOpen ? groupId : undefined}
					className={cn(rowClass, 'gap-1.5 text-foreground')}
					onClick={() => onToggleDir(node.path)}
					onKeyDown={(event) => {
						// Right opens, Left closes — the rest of the roving keys live on the tree.
						if (event.key !== (isOpen ? 'ArrowLeft' : 'ArrowRight')) return;
						event.preventDefault();
						onToggleDir(node.path);
					}}
					role="treeitem"
					style={indent}
					tabIndex={node.path === tabbablePath ? 0 : -1}
					type="button">
					<ChevronRight
						className={cn(
							'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
							isOpen && 'rotate-90',
						)}
					/>
					{isOpen ? (
						<FolderOpen className={`h-3.5 w-3.5 shrink-0 ${toneText.teal}`} />
					) : (
						<Folder className={`h-3.5 w-3.5 shrink-0 ${toneText.teal}`} />
					)}
					<span className="truncate font-mono text-xs">{node.name}</span>
				</button>
				{isOpen ? (
					<div id={groupId} role="group">
						{shown.map((child) => (
							<FileTreeNode
								depth={depth + 1}
								expanded={expanded}
								key={child.path}
								node={child}
								onSelect={onSelect}
								onToggleDir={onToggleDir}
								selectedPath={selectedPath}
								tabbablePath={tabbablePath}
							/>
						))}
						{hidden > 0 ? (
							<p
								className="py-1 pr-3 text-xs text-muted-foreground"
								style={{ paddingLeft: `${0.5 + (depth + 1) * 0.85}rem` }}>
								+{hidden.toLocaleString()} more in this folder
							</p>
						) : null}
					</div>
				) : null}
			</>
		);
	}
	const selected = selectedPath === node.path;
	return (
		<button
			aria-level={depth + 1}
			aria-selected={selected}
			className={cn(
				rowClass,
				selected
					? 'bg-accent-muted text-accent-muted-foreground shadow-[inset_4px_0_0_var(--accent)]'
					: 'text-foreground',
			)}
			onClick={() => onSelect(node.path)}
			role="treeitem"
			style={indent}
			tabIndex={node.path === tabbablePath ? 0 : -1}
			type="button">
			<span aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
			<FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			<span className="flex min-w-0 flex-1 items-baseline gap-2">
				<span className="truncate font-mono text-xs">{node.name}</span>
				{/* text-xs, the app's metadata step — this was `text-[0.7rem]`, smaller than the
				    scale's floor, for the same datum the viewer header shows at text-xs. */}
				<span className="shrink-0 text-xs text-muted-foreground">
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
	className,
	files,
	onSelect,
	query,
	selectedPath,
}: {
	className?: string;
	files: ProjectCodeFileEntry[];
	onSelect: (path: string) => void;
	query: string;
	selectedPath: null | string;
}) {
	const filtered = useMemo(
		() => files.filter((file) => matchesQuery(file, query)),
		[files, query],
	);
	// The whole filtered set, not a 500-file prefix of it: the cap now applies per directory, so the
	// open file always has a row of its own to be highlighted in.
	const tree = useMemo(() => buildTree(filtered), [filtered]);
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
	const roots = sortedChildren(tree);
	// Exactly one row is in the tab order; the arrow keys reach the rest.
	const tabbablePath = filtered.some((file) => file.path === selectedPath)
		? selectedPath
		: (roots[0]?.path ?? null);
	return (
		// No inner border: the pane already has one against the viewer, and the Card has another.
		// The height comes from the row (see codeBrowserHeight.ts) and is lifted below lg, where
		// the tree sits under the viewer in page flow rather than beside it — a nested scroller
		// there swallowed the wheel.
		<div
			aria-label="Tracked files"
			className={cn('overflow-y-auto', codeBrowserScrollerClass, className)}
			onKeyDown={handleTreeKeyDown}
			role="tree">
			{roots.map((child) => (
				<FileTreeNode
					depth={0}
					expanded={isExpanded}
					key={child.path}
					node={child}
					onSelect={onSelect}
					onToggleDir={onToggleDir}
					selectedPath={selectedPath}
					tabbablePath={tabbablePath}
				/>
			))}
		</div>
	);
}

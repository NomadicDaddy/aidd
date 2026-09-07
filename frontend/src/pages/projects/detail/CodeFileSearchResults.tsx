import { default as FileText } from 'lucide-react/dist/esm/icons/file-text';

import type { ProjectCodeFileEntry } from '../../../api/types.ts';

import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { cn } from '../../../lib/cn.ts';
import { formatBytes } from '../../../lib/formatters.ts';
import { touchTargetRowClass } from '../../../lib/touchTarget.ts';
import { codeBrowserScrollerClass } from './codeBrowserHeight.ts';
import { handleTreeKeyDown } from './codeTreeKeyboard.ts';

const rowClass = `flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none ${touchTargetRowClass}`;

function HighlightMatch({ needle, text }: { needle: string; text: string }) {
	const matchAt = text.toLowerCase().indexOf(needle);
	if (matchAt === -1) return text;
	return (
		<>
			{text.slice(0, matchAt)}
			<mark className="bg-accent/20 text-foreground">
				{text.slice(matchAt, matchAt + needle.length)}
			</mark>
			{text.slice(matchAt + needle.length)}
		</>
	);
}

function SearchResultRow({
	file,
	onSelect,
	query,
	selected,
	tabbable,
}: {
	file: ProjectCodeFileEntry;
	onSelect: (path: string) => void;
	query: string;
	selected: boolean;
	tabbable: boolean;
}) {
	const slash = file.path.lastIndexOf('/');
	const name = slash === -1 ? file.path : file.path.slice(slash + 1);
	const parent = slash === -1 ? '.' : file.path.slice(0, slash);
	const needle = query.trim().toLowerCase();
	const pathMatches = file.path.toLowerCase().includes(needle);
	const nameMatches = name.toLowerCase().includes(needle);
	const parentMatches = parent.toLowerCase().includes(needle);
	const languageExplainsMatch =
		!pathMatches && (file.language ?? '').toLowerCase().includes(needle);
	return (
		<button
			aria-level={1}
			aria-selected={selected}
			className={cn(
				rowClass,
				selected
					? 'bg-accent-muted text-accent-muted-foreground shadow-[inset_4px_0_0_var(--accent)] hover:bg-accent-muted'
					: 'text-foreground hover:bg-muted',
			)}
			onClick={() => onSelect(file.path)}
			role="treeitem"
			tabIndex={tabbable ? 0 : -1}
			title={file.path}
			type="button">
			<FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			<span className="flex min-w-0 flex-1 items-baseline font-mono text-xs">
				<span className="max-w-[45%] shrink-0 truncate">
					<HighlightMatch needle={needle} text={name} />
				</span>
				<span aria-hidden="true" className="shrink-0 text-muted-foreground">
					&nbsp;·&nbsp;
				</span>
				<span
					className="min-w-0 flex-1 truncate text-left text-muted-foreground [direction:rtl]"
					dir="rtl">
					{pathMatches && !nameMatches && !parentMatches ? (
						<mark className="bg-accent/20 text-foreground">{parent}</mark>
					) : (
						<HighlightMatch needle={needle} text={parent} />
					)}
					{languageExplainsMatch ? (
						<>
							&nbsp;·&nbsp;
							<mark className="bg-accent/20 text-foreground">{file.language}</mark>
						</>
					) : null}
				</span>
			</span>
			<span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
				{formatBytes(file.sizeBytes)}
			</span>
		</button>
	);
}

export function CodeFileSearchResults({
	className,
	files,
	onSelect,
	query,
	selectedPath,
}: {
	className?: string | undefined;
	files: ProjectCodeFileEntry[];
	onSelect: (path: string) => void;
	query: string;
	selectedPath: null | string;
}) {
	const results = files.toSorted((left, right) => left.path.localeCompare(right.path));
	const tabbablePath = results.some((file) => file.path === selectedPath)
		? selectedPath
		: (results[0]?.path ?? null);
	return (
		<OverflowScroller
			ariaLabel="Tracked file search results"
			className={codeBrowserScrollerClass}
			onKeyDown={handleTreeKeyDown}
			role="tree"
			scrollerClassName={cn('h-full overflow-y-auto p-1', className)}
			showTopCue
			surface="card">
			{results.map((file) => (
				<SearchResultRow
					file={file}
					key={file.path}
					onSelect={onSelect}
					query={query}
					selected={selectedPath === file.path}
					tabbable={tabbablePath === file.path}
				/>
			))}
		</OverflowScroller>
	);
}

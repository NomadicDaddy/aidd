import { default as ClipboardCopy } from 'lucide-react/dist/esm/icons/clipboard-copy';
import { default as Copy } from 'lucide-react/dist/esm/icons/copy';
import { toast } from 'sonner';

import type { ProjectCodeFileResponse, ProjectCodeFileState } from '../../../api/types.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { FilePath } from '../../../components/shared/FilePath.tsx';
import { SkeletonLines } from '../../../components/shared/LoadingState.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { IconButton } from '../../../components/ui/button.tsx';
import { cn } from '../../../lib/cn.ts';
import { formatBytes } from '../../../lib/formatters.ts';
import { describeOutputSlice, formatOutputSlice } from '../../../lib/outputSlice.ts';
import { toneBorder, toneSurface, toneText } from '../../../lib/tones.ts';
import { codeBrowserScrollerClass } from './codeBrowserHeight.ts';
import { isCommentLine, splitStrings } from './codeLineTokens.ts';
import { ImageFilePreview } from './ImageFilePreview.tsx';

const maxRenderedLines = 2500;

const lineClass = 'px-3 font-mono text-xs leading-relaxed whitespace-pre';

const fileMessages: Record<Exclude<ProjectCodeFileState, 'ok'>, string> = {
	binary: 'Binary file.',
	error: 'File could not be loaded.',
	image: 'Image file could not be loaded.',
	'invalid-path': 'File is not available in the tracked source set.',
	missing: 'Tracked file is missing on disk.',
	'not-a-repo': 'This project directory is not a git repository.',
	'project-missing': 'The project directory no longer exists on disk.',
};

function copyText(label: string, value: string): void {
	void navigator.clipboard
		.writeText(value)
		.then(() => toast.success(`${label} copied`))
		.catch(() => toast.error(`Could not copy ${label.toLowerCase()}`));
}

function CodeLine({ language, line }: { language?: null | string; line: string }) {
	if (line.length === 0) return <pre className={`${lineClass} text-foreground`}> </pre>;
	if (isCommentLine(line, language)) {
		return <pre className={`${lineClass} text-muted-foreground`}>{line}</pre>;
	}
	return (
		<pre className={`${lineClass} text-foreground`}>
			{splitStrings(line).map((segment, index) => (
				<span
					className={segment.kind === 'string' ? toneText.emerald : undefined}
					key={index}>
					{segment.text}
				</span>
			))}
		</pre>
	);
}

export function CodeFileViewer({
	data,
	isError,
	isLoading,
}: {
	data: ProjectCodeFileResponse | undefined;
	isError: boolean;
	isLoading: boolean;
}) {
	if (isLoading) {
		return (
			<div className="p-4">
				<SkeletonLines count={8} label="Loading source file…" />
			</div>
		);
	}
	if (isError) return <EmptyState className="m-4">File could not be loaded.</EmptyState>;
	if (!data) return <EmptyState className="m-4">No file selected.</EmptyState>;
	if (data.state !== 'image' && data.state !== 'ok') {
		return <EmptyState className="m-4">{data.reason ?? fileMessages[data.state]}</EmptyState>;
	}
	const isImage = data.state === 'image';
	const lines = isImage ? [] : data.content.split(/\r?\n/);
	const visibleLines = lines.slice(0, maxRenderedLines);
	const clipped = lines.length > visibleLines.length;
	const slice = isImage ? null : describeOutputSlice(data.content, data.totalBytes);
	const pathSegments = data.path.split('/');
	const fileName = pathSegments.at(-1) ?? data.path;
	return (
		// A column so the scroller below can take the height the header and any notice leave, and
		// end on the same line as the file tree beside it.
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="flex shrink-0 flex-col items-stretch gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
				<div className="w-full min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="max-w-full min-w-0 text-sm font-semibold text-foreground">
							<FilePath
								className="block max-w-full [overflow-wrap:anywhere] sm:hidden"
								path={fileName}
								title={data.path}
							/>
							<FilePath
								className="hidden max-w-full [overflow-wrap:anywhere] sm:block"
								path={data.path}
							/>
						</h3>
						{data.language ? <Badge tone="neutral">{data.language}</Badge> : null}
						{clipped ? (
							<Badge tone="amber">
								first {maxRenderedLines.toLocaleString()} lines
							</Badge>
						) : null}
						{/* Plain text, matching the tree three inches to the left: Badge is this
						    app's status pill and a byte count is not a status. */}
						<span className="font-mono text-xs text-muted-foreground tabular-nums">
							{formatBytes(data.sizeBytes)}
						</span>
						{isImage ? null : (
							<span className="font-mono text-xs text-muted-foreground tabular-nums">
								{lines.length.toLocaleString()} lines
							</span>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
					<IconButton
						ariaLabel="Copy file path"
						onClick={() => copyText('File path', data.path)}
						variant="ghost">
						<Copy className="h-4 w-4" />
					</IconButton>
					{isImage ? null : (
						<IconButton
							ariaLabel="Copy file content"
							onClick={() => copyText('File content', data.content)}
							variant="ghost">
							<ClipboardCopy className="h-4 w-4" />
						</IconButton>
					)}
				</div>
			</div>
			{data.truncated ? (
				<p
					className={cn(
						'shrink-0 border-b px-3 py-2 text-xs',
						toneBorder.amber,
						toneSurface.amber,
						toneText.amber,
					)}>
					{slice ? formatOutputSlice(slice, 'first') : null}
				</p>
			) : null}
			{isImage ? (
				<div
					className={cn(
						'flex min-h-[28rem] items-center justify-center overflow-auto bg-black/90 p-4',
						codeBrowserScrollerClass,
					)}>
					{/* Keyed on the path so a new file starts a fresh decode rather than briefly
					    showing the previous image at the previous image's dimensions. */}
					<ImageFilePreview alt={data.path} key={data.path} src={data.content} />
				</div>
			) : (
				<OverflowScroller
					ariaLabel={`Source file ${data.path}`}
					className={codeBrowserScrollerClass}
					scrollerClassName="h-full overflow-y-auto bg-card py-2">
					{visibleLines.map((line, index) => (
						<div className="grid grid-cols-[4rem_minmax(0,1fr)]" key={index}>
							<div className="sticky left-0 z-10 border-r border-border bg-card pr-3 text-right font-mono text-xs leading-relaxed text-muted-foreground select-none">
								{index + 1}
							</div>
							<CodeLine language={data.language} line={line} />
						</div>
					))}
					{clipped ? (
						<p className={cn('px-3 py-2 text-xs', toneText.amber)}>
							Only the first {maxRenderedLines.toLocaleString()} lines are rendered.
						</p>
					) : null}
				</OverflowScroller>
			)}
		</div>
	);
}

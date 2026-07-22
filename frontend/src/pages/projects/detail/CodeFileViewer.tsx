import { default as Code2 } from 'lucide-react/dist/esm/icons/code-2';
import { default as Copy } from 'lucide-react/dist/esm/icons/copy';
import { toast } from 'sonner';

import type { ProjectCodeFileResponse, ProjectCodeFileState } from '../../../api/types.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../../components/shared/LoadingState.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { IconButton } from '../../../components/ui/button.tsx';
import { formatBytes } from '../../../lib/formatters.ts';

const maxRenderedLines = 2500;

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
	return (
		<div className="min-w-0">
			<div className="flex items-start justify-between gap-3 border-b border-neutral-200 p-3 dark:border-neutral-800">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="font-mono text-sm font-semibold break-all text-neutral-950 dark:text-neutral-50">
							{data.path}
						</h3>
						{data.language ? <Badge tone="cyan">{data.language}</Badge> : null}
						<Badge tone="neutral">{formatBytes(data.sizeBytes)}</Badge>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
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
							<Code2 className="h-4 w-4" />
						</IconButton>
					)}
				</div>
			</div>
			{data.truncated ? (
				<p className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
					Showing the first {formatBytes(data.content.length)} of{' '}
					{formatBytes(data.totalBytes)}.
				</p>
			) : null}
			{isImage ? (
				<div className="flex max-h-[42rem] min-h-[28rem] items-center justify-center overflow-auto bg-neutral-950 p-4">
					<img
						alt={data.path}
						className="max-h-[38rem] max-w-full object-contain"
						src={data.content}
					/>
				</div>
			) : (
				<div className="max-h-[42rem] overflow-auto bg-white py-2 dark:bg-neutral-950">
					{visibleLines.map((line, index) => (
						<div className="grid grid-cols-[4rem_minmax(0,1fr)]" key={index}>
							<div className="border-r border-neutral-100 pr-3 text-right font-mono text-xs leading-6 text-neutral-400 select-none dark:border-neutral-900 dark:text-neutral-600">
								{index + 1}
							</div>
							<pre className="px-3 font-mono text-xs leading-6 whitespace-pre text-neutral-800 dark:text-neutral-200">
								{line || ' '}
							</pre>
						</div>
					))}
					{clipped ? (
						<p className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
							Only the first {maxRenderedLines.toLocaleString()} lines are rendered.
						</p>
					) : null}
				</div>
			)}
		</div>
	);
}

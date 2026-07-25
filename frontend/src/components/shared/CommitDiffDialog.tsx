import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { default as Copy } from 'lucide-react/dist/esm/icons/copy';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { GitCommitRef } from '../../api/types.ts';

import { useCommitDiff } from '../../hooks/useCommits.ts';
import { shortCommitHash } from '../../lib/commitFormat.ts';
import { formatBytes } from '../../lib/formatters.ts';
import { type DiffFile, type DiffLineKind, parseGitShow } from '../../lib/unifiedDiff.ts';
import { IconButton } from '../ui/button.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';

// Server responses are byte-capped; this additionally bounds DOM nodes for a single
// pathological file (e.g. a regenerated lockfile) so the dialog stays responsive.
const maxRenderedLinesPerFile = 3000;

const lineClasses: Record<DiffLineKind, string> = {
	add: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
	context: 'text-neutral-700 dark:text-neutral-300',
	del: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
	hunk: 'text-teal-700 dark:text-teal-400',
	meta: 'text-neutral-400 dark:text-neutral-500',
};

const stateNotices: Record<string, string> = {
	error: 'The diff could not be loaded.',
	'missing-commit':
		'This commit is no longer reachable in the repository (rebased or garbage-collected).',
	'not-a-repo': 'The project directory is not a git repository.',
	'project-missing': 'The project directory does not exist on disk.',
};

function DiffFileSection({
	collapsed,
	file,
	onToggle,
	sectionRef,
}: {
	collapsed: boolean;
	file: DiffFile;
	onToggle: () => void;
	sectionRef: (node: HTMLElement | null) => void;
}) {
	const overflowing = file.lines.length > maxRenderedLinesPerFile;
	const visibleLines = overflowing ? file.lines.slice(0, maxRenderedLinesPerFile) : file.lines;
	const Chevron = collapsed ? ChevronRight : ChevronDown;
	return (
		<section
			className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800"
			ref={sectionRef}>
			<button
				className="flex w-full items-center gap-2 bg-neutral-50 px-3 py-2 text-left hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none dark:bg-neutral-900 dark:hover:bg-neutral-800/80"
				onClick={onToggle}
				type="button">
				<Chevron aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
				<span className="min-w-0 truncate font-mono text-xs text-neutral-800 dark:text-neutral-200">
					{file.displayPath}
				</span>
				<span className="ml-auto shrink-0 font-mono text-[0.7rem]">
					<span className="text-emerald-600 dark:text-emerald-400">
						+{file.additions}
					</span>{' '}
					<span className="text-red-600 dark:text-red-400">−{file.deletions}</span>
				</span>
			</button>
			{collapsed ? null : file.isBinary ? (
				<p className="bg-white px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
					Binary file changed.
				</p>
			) : (
				<div className="overflow-x-auto bg-white py-1 dark:bg-neutral-950">
					{visibleLines.map((line, index) => (
						<div
							className={`px-3 font-mono text-xs leading-relaxed whitespace-pre ${lineClasses[line.kind]}`}
							key={index}>
							{line.text || ' '}
						</div>
					))}
					{overflowing ? (
						<p className="px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
							Only the first {maxRenderedLinesPerFile.toLocaleString()} lines of this
							file are shown.
						</p>
					) : null}
				</div>
			)}
		</section>
	);
}

export function CommitDiffDialog({
	commit,
	onClose,
	projectId,
}: {
	commit: GitCommitRef;
	onClose: () => void;
	projectId: string;
}) {
	const query = useCommitDiff(projectId, commit.hash);
	const parsed = useMemo(
		() => (query.data?.state === 'ok' ? parseGitShow(query.data.diff) : null),
		[query.data],
	);
	const [collapsedFiles, setCollapsedFiles] = useState<Set<number>>(new Set());
	const sectionRefs = useRef<(HTMLElement | null)[]>([]);

	const toggleFile = (index: number) => {
		setCollapsedFiles((previous) => {
			const next = new Set(previous);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	};

	const jumpToFile = (index: number) => {
		setCollapsedFiles((previous) => {
			if (!previous.has(index)) return previous;
			const next = new Set(previous);
			next.delete(index);
			return next;
		});
		sectionRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	const copyHash = () => {
		void navigator.clipboard
			.writeText(commit.hash)
			.then(() => toast.success('Commit hash copied'))
			.catch(() => toast.error('Could not copy commit hash'));
	};

	const data = query.data;
	const notice = data && data.state !== 'ok' ? (stateNotices[data.state] ?? data.reason) : null;

	return (
		<Dialog
			aria-labelledby="commit-diff-title"
			initialFocus="container"
			lockScroll
			onClose={onClose}
			open
			overlayClassName="focus:outline-none"
			role="dialog">
			<DialogPanel className="flex max-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col overflow-hidden">
				<div className="flex items-start justify-between gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
					<div className="min-w-0">
						<h2
							className="flex items-center gap-2 text-sm font-semibold text-foreground"
							id="commit-diff-title">
							<span className="font-mono text-neutral-500 dark:text-neutral-400">
								{shortCommitHash(commit.hash)}
							</span>
							<span className="truncate">{commit.subject}</span>
						</h2>
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<IconButton
							ariaLabel="Copy full commit hash"
							onClick={copyHash}
							variant="ghost">
							<Copy className="h-4 w-4" />
						</IconButton>
						<IconButton ariaLabel="Close commit diff" onClick={onClose} variant="ghost">
							<X className="h-4 w-4" />
						</IconButton>
					</div>
				</div>
				<div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
					{query.isLoading ? (
						<p className="text-xs text-neutral-500 dark:text-neutral-400">
							Loading diff…
						</p>
					) : null}
					{query.isError ? (
						<p className="text-xs text-red-600 dark:text-red-400">
							Failed to load the diff. Try again.
						</p>
					) : null}
					{notice ? (
						<p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/70 dark:text-neutral-300">
							{notice}
						</p>
					) : null}
					{data?.state === 'ok' && data.truncated ? (
						<p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
							Showing the first {formatBytes(data.diff.length)} of{' '}
							{formatBytes(data.totalBytes)} — the patch was capped by the server.
						</p>
					) : null}
					{parsed?.header ? (
						<pre className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs whitespace-pre text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900/70 dark:text-neutral-300">
							{parsed.header}
						</pre>
					) : null}
					{parsed && parsed.files.length > 1 ? (
						<div className="flex flex-wrap gap-1.5">
							{parsed.files.map((file, index) => (
								<button
									className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-left font-mono text-[0.7rem] text-neutral-600 hover:border-teal-400 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400 dark:hover:border-teal-500"
									key={`${file.displayPath}-${index}`}
									onClick={() => jumpToFile(index)}
									type="button">
									<span className="truncate">{file.displayPath}</span>
									<span className="shrink-0">
										<span className="text-emerald-600 dark:text-emerald-400">
											+{file.additions}
										</span>{' '}
										<span className="text-red-600 dark:text-red-400">
											−{file.deletions}
										</span>
									</span>
								</button>
							))}
						</div>
					) : null}
					{parsed?.files.map((file, index) => (
						<DiffFileSection
							collapsed={collapsedFiles.has(index)}
							file={file}
							key={`${file.displayPath}-${index}`}
							onToggle={() => toggleFile(index)}
							sectionRef={(node) => {
								sectionRefs.current[index] = node;
							}}
						/>
					))}
					{parsed && parsed.files.length === 0 ? (
						<p className="text-xs text-neutral-500 dark:text-neutral-400">
							This commit has no textual changes (empty commit or merge without
							conflicts).
						</p>
					) : null}
				</div>
			</DialogPanel>
		</Dialog>
	);
}

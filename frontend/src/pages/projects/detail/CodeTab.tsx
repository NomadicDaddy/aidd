import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router';

import type { ProjectCodeFileEntry, ProjectCodeTreeState } from '../../../api/types.ts';

import { DisclosureMarker } from '../../../components/shared/DisclosureMarker.tsx';
import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../../components/shared/LoadingState.tsx';
import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { useProjectCodeFile, useProjectCodeTree } from '../../../hooks/useProjectCode.ts';
import { useViewportFill } from '../../../hooks/useViewportFill.ts';
import { cn } from '../../../lib/cn.ts';
import { codeBrowserHeightClass } from './codeBrowserHeight.ts';
import { CodeFileTree } from './CodeFileTree.tsx';
import { CodeFileViewer } from './CodeFileViewer.tsx';
import { matchesQuery } from './codeTreeNodes.ts';
import { projectDetailViewportGutterPx } from './projectDetailViewport.ts';

const treeMessages: Record<Exclude<ProjectCodeTreeState, 'ok'>, string> = {
	error: 'Tracked files could not be loaded.',
	'not-a-repo': 'This project directory is not a git repository.',
	'project-missing': 'The project directory no longer exists on disk.',
};

function chooseInitialFile(files: ProjectCodeFileEntry[]): null | string {
	return (files.find((file) => file.language !== null) ?? files[0])?.path ?? null;
}

export function CodeTab({ projectId }: { projectId: string }) {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigationId = useId();
	const [navigationOpen, setNavigationOpen] = useState(false);
	const [query, setQuery] = useState('');
	const tree = useProjectCodeTree(projectId);
	const browserRef = useViewportFill<HTMLDivElement>({
		gutterPx: projectDetailViewportGutterPx,
		refreshKey: tree.data,
	});
	const files = tree.data?.state === 'ok' ? tree.data.files : [];
	const matchingFileCount = files.filter((file) => matchesQuery(file, query)).length;
	const searching = query.trim().length > 0;
	const requestedFile = searchParams.get('file');
	const selectedPath = files.some((file) => file.path === requestedFile)
		? requestedFile
		: chooseInitialFile(files);
	const fileQuery = useProjectCodeFile(projectId, selectedPath);
	const intro = (
		<TabIntro
			description="Browse git-tracked files in read-only mode. Large repositories are capped per directory, and the viewer shows at most the first 2,500 lines or 768 KB of a file."
			title="Code"
		/>
	);

	useEffect(() => {
		if (!selectedPath || requestedFile === selectedPath) return;
		setSearchParams(
			(previous) => {
				const next = new URLSearchParams(previous);
				next.set('file', selectedPath);
				return next;
			},
			{ replace: true },
		);
	}, [requestedFile, selectedPath, setSearchParams]);

	const selectFile = (path: string) => {
		setNavigationOpen(false);
		setSearchParams(
			(previous) => {
				const next = new URLSearchParams(previous);
				next.set('file', path);
				return next;
			},
			{ replace: false },
		);
	};

	if (tree.isLoading) {
		return (
			<div className="space-y-4">
				{intro}
				<Card aria-busy="true">
					<SkeletonLines count={8} label="Loading tracked files…" />
				</Card>
			</div>
		);
	}
	if (tree.isError) {
		return (
			<div className="space-y-4">
				{intro}
				<EmptyState>
					Tracked files are temporarily unavailable. Try again in a moment.
				</EmptyState>
			</div>
		);
	}
	if (tree.data && tree.data.state !== 'ok') {
		return (
			<div className="space-y-4">
				{intro}
				<EmptyState>{treeMessages[tree.data.state]}</EmptyState>
			</div>
		);
	}
	return (
		<div className="space-y-4">
			{intro}
			{/* `@container`: the two tiers below are read off this card's width. See codeBrowserHeight.ts. */}
			<Card className="@container overflow-hidden p-0">
				{/* Below the split, a 44px disclosure keeps file navigation ahead of the viewer without
			    filling the initial viewport with the tree. Its closed row retains the current path and
			    filtered count; opening it reveals the same keyboard tree used by the split layout.

			    Split, the row takes one height off the viewport and both panes scroll inside it.
			    Separate rem caps — 34rem for the tree, 42rem for the viewer, say — would end the
			    two halves of one browser 128px apart, the shorter one leaving a band of empty card
			    beside a still-scrolling neighbour, and neither number would have anything to do
			    with how tall the window actually is.

			    Two tiers, because one tree width cannot serve both. 22rem holds about 40 characters
			    of file name, which is where `useProjectCodeTree.ts` or a nested route directory
			    truncates; at 2250x1309 the card is around 1900px and the viewer still keeps 1550
			    after the tree grows to 30rem, so the wide tier spends width on the names rather
			    than on a viewer measure that was already past what source lines use. The viewer
			    itself is deliberately uncapped: `CodeFileViewer` scrolls long lines sideways, so a
			    measure there would put lines that currently fit behind a horizontal scrollbar. */}
				{/* A base column template, not just the two gated ones. Below 61rem the grid falls back to
			    a single implicit `auto` track, whose base size is its item’s min-content contribution
			    — and the tree pane’s contribution is an unbroken repository path with nothing to break
			    on. At 390x844 that resolved the one column to 374.25px inside a 356px card, so the card
			    right border and the viewer’s end-fade chevron were painted off screen and both
			    file-header copy buttons sat at x=733.7 and x=781.7, past the viewport entirely. Deeper
			    paths pushed it to 450px and 820.66px. `minmax(0,1fr)` fixes the track from the track
			    side and `min-w-0` on the aside zeroes the contribution from the item side; both are
			    here because the panes below carry their own `truncate`/`overflow` and need a parent
			    that is allowed to be narrower than they are. */}
				<div
					className={cn(
						'grid min-h-[32rem] grid-cols-[minmax(0,1fr)] gap-0 @min-[61rem]:min-h-0 @min-[61rem]:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] @min-[100rem]:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)]',
						codeBrowserHeightClass,
					)}
					ref={browserRef}>
					<aside className="order-1 min-w-0 border-b border-border @min-[61rem]:flex @min-[61rem]:min-h-0 @min-[61rem]:flex-col @min-[61rem]:border-r @min-[61rem]:border-b-0">
						<div className="flex items-center gap-2 border-b border-border p-3">
							<label className="relative block min-w-0 flex-1">
								<span className="sr-only">Search tracked files</span>
								<Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
								<Input
									className="pl-9"
									name="projectCodeSearch"
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Search tracked files"
									value={query}
								/>
							</label>
							<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
								{searching
									? `${matchingFileCount.toLocaleString()} ${matchingFileCount === 1 ? 'result' : 'results'}`
									: `${files.length.toLocaleString()} ${files.length === 1 ? 'file' : 'files'}`}
							</span>
							{tree.data?.truncated ? (
								<Badge casing="title" tone="amber">
									capped
								</Badge>
							) : null}
						</div>
						<button
							aria-controls={navigationId}
							aria-expanded={navigationOpen}
							aria-label={`Tracked files, ${selectedPath ?? 'no file selected'}, ${matchingFileCount.toLocaleString()} results`}
							className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent-muted focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none @min-[61rem]:hidden"
							onClick={() => setNavigationOpen((open) => !open)}
							type="button">
							<span className="shrink-0 text-sm font-medium text-foreground">
								Tracked files
							</span>
							<span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
								{selectedPath ?? 'No file selected'}
							</span>
							{searching ? (
								<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
									{matchingFileCount.toLocaleString()}{' '}
									{matchingFileCount === 1 ? 'result' : 'results'}
								</span>
							) : null}
							<span className="text-muted-foreground">
								<DisclosureMarker open={navigationOpen} />
							</span>
						</button>
						<div
							className={cn(
								'min-h-0 flex-col px-3 pt-3',
								navigationOpen ? 'flex' : 'hidden',
								'@min-[61rem]:flex @min-[61rem]:flex-1',
							)}
							id={navigationId}>
							<CodeFileTree
								className="max-h-[28rem] @min-[61rem]:max-h-none"
								files={files}
								onClearQuery={() => setQuery('')}
								onSelect={selectFile}
								query={query}
								selectedPath={selectedPath}
							/>
						</div>
					</aside>
					<section className="order-2 min-w-0 @min-[61rem]:flex @min-[61rem]:min-h-0 @min-[61rem]:flex-col">
						<CodeFileViewer
							data={fileQuery.data}
							isError={fileQuery.isError}
							isLoading={fileQuery.isLoading}
						/>
					</section>
				</div>
			</Card>
		</div>
	);
}

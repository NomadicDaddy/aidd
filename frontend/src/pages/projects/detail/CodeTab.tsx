import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import type { ProjectCodeFileEntry, ProjectCodeTreeState } from '../../../api/types.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../../components/shared/LoadingState.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { useProjectCodeFile, useProjectCodeTree } from '../../../hooks/useProjectCode.ts';
import { cn } from '../../../lib/cn.ts';
import { codeBrowserHeightClass } from './codeBrowserHeight.ts';
import { CodeFileTree } from './CodeFileTree.tsx';
import { CodeFileViewer } from './CodeFileViewer.tsx';
import { matchesQuery } from './codeTreeNodes.ts';

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
	const files = useMemo(() => (tree.data?.state === 'ok' ? tree.data.files : []), [tree.data]);
	const matchingFileCount = useMemo(
		() => files.filter((file) => matchesQuery(file, query)).length,
		[files, query],
	);
	const requestedFile = searchParams.get('file');
	const selectedPath = files.some((file) => file.path === requestedFile)
		? requestedFile
		: chooseInitialFile(files);
	const fileQuery = useProjectCodeFile(projectId, selectedPath);

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
			<Card aria-busy="true">
				<SkeletonLines count={8} label="Loading tracked files…" />
			</Card>
		);
	}
	if (tree.isError) {
		return (
			<EmptyState>
				Tracked files are temporarily unavailable. Try again in a moment.
			</EmptyState>
		);
	}
	if (tree.data && tree.data.state !== 'ok') {
		return <EmptyState>{treeMessages[tree.data.state]}</EmptyState>;
	}
	return (
		// `@container`: the two tiers below are read off this card's width. See codeBrowserHeight.ts.
		<Card className="@container overflow-hidden p-0">
			{/* No icon on a tab's opening header. Fifteen of the seventeen project tabs open with a
			    bare title, so on Code and on Notes the title started about 22px further right than
			    on their neighbours and picked up a teal mark that said nothing the word did not
			    already say. Icons stay on the cards inside a tab that are saying something the text
			    is not — the red mark on Delete project, on Move, on the milestones gate. */}
			<CardHeader
				action={
					<label className="relative w-full max-w-sm">
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
				}
				badge={
					<>
						<Badge tone="neutral">{files.length.toLocaleString()} files</Badge>
						{tree.data?.truncated ? <Badge tone="amber">capped</Badge> : null}
					</>
				}
				className="mb-0 items-center border-b border-border p-4"
				title="Code"
			/>
			{/* Below the split, a 44px disclosure keeps file navigation ahead of the viewer without
			    filling the initial viewport with the tree. Its closed row retains the current path and
			    filtered count; opening it reveals the same keyboard tree used by the split layout.

			    Split, the row takes one height off the viewport and both panes scroll inside it.
			    They used to carry their own rem caps — 34rem for the tree, 42rem for the viewer —
			    so the two halves of one browser ended 128px apart, the shorter one leaving a band
			    of empty card beside a still-scrolling neighbour, and neither number had anything
			    to do with how tall the window actually was.

			    Two tiers, because one tree width cannot serve both. 22rem holds about 40 characters
			    of file name, which is where `useProjectCodeTree.ts` or a nested route directory
			    truncates; at 2250x1309 the card is around 1900px and the viewer still keeps 1550
			    after the tree grows to 30rem, so the wide tier spends width on the names rather
			    than on a viewer measure that was already past what source lines use. The viewer
			    itself is deliberately uncapped: `CodeFileViewer` scrolls long lines sideways, so a
			    measure there would put lines that currently fit behind a horizontal scrollbar. */}
			<div
				className={cn(
					'grid min-h-[32rem] gap-0 @min-[61rem]:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] @min-[100rem]:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)]',
					codeBrowserHeightClass,
				)}>
				<aside className="order-1 border-b border-border @min-[61rem]:flex @min-[61rem]:min-h-0 @min-[61rem]:flex-col @min-[61rem]:border-r @min-[61rem]:border-b-0">
					<button
						aria-controls={navigationId}
						aria-expanded={navigationOpen}
						aria-label={`Tracked files, ${selectedPath ?? 'no file selected'}, ${matchingFileCount.toLocaleString()} results`}
						className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none @min-[61rem]:hidden"
						onClick={() => setNavigationOpen((open) => !open)}
						type="button">
						<span className="shrink-0 text-sm font-medium text-foreground">
							Tracked files
						</span>
						<span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
							{selectedPath ?? 'No file selected'}
						</span>
						<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
							{matchingFileCount.toLocaleString()} results
						</span>
						<ChevronDown
							aria-hidden="true"
							className={cn(
								'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
								navigationOpen && 'rotate-180',
							)}
						/>
					</button>
					<div
						className={cn(
							'min-h-0 flex-col p-3',
							navigationOpen ? 'flex' : 'hidden',
							'@min-[61rem]:flex @min-[61rem]:flex-1',
						)}
						id={navigationId}>
						<CodeFileTree
							className="max-h-[28rem] @min-[61rem]:max-h-none"
							files={files}
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
	);
}

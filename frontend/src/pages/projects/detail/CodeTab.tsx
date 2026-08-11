import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { useEffect, useState } from 'react';
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
	const [query, setQuery] = useState('');
	const tree = useProjectCodeTree(projectId);
	const files = tree.data?.state === 'ok' ? tree.data.files : [];
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
			{/* Stacked, the viewer comes first. Above it, the tree's own scroller filled the entire
			    viewport with file names — not one line of the code the reader came for was visible,
			    and the nested region stole the wheel on the way past.

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
				<aside className="order-2 border-t border-border p-3 @min-[61rem]:order-1 @min-[61rem]:flex @min-[61rem]:min-h-0 @min-[61rem]:flex-col @min-[61rem]:border-t-0 @min-[61rem]:border-r">
					<CodeFileTree
						files={files}
						onSelect={selectFile}
						query={query}
						selectedPath={selectedPath}
					/>
				</aside>
				<section className="order-1 min-w-0 @min-[61rem]:order-2 @min-[61rem]:flex @min-[61rem]:min-h-0 @min-[61rem]:flex-col">
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

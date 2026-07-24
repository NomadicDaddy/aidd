import { default as Code2 } from 'lucide-react/dist/esm/icons/code-2';
import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { ProjectCodeFileEntry, ProjectCodeTreeState } from '../../../api/types.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../../components/shared/LoadingState.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { useProjectCodeFile, useProjectCodeTree } from '../../../hooks/useProjectCode.ts';
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
			{ replace: true }
		);
	}, [requestedFile, selectedPath, setSearchParams]);

	const selectFile = (path: string) => {
		setSearchParams(
			(previous) => {
				const next = new URLSearchParams(previous);
				next.set('file', path);
				return next;
			},
			{ replace: false }
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
		<Card className="overflow-hidden p-0">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
				<div className="flex min-w-0 items-center gap-2">
					<Code2 className="h-4 w-4 text-teal-700 dark:text-teal-300" />
					<h2 className="text-foreground text-sm font-semibold">Code</h2>
					<Badge tone="neutral">{files.length.toLocaleString()} files</Badge>
					{tree.data?.truncated ? <Badge tone="amber">capped</Badge> : null}
				</div>
				<label className="relative w-full max-w-sm">
					<span className="sr-only">Search tracked files</span>
					<Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-neutral-400" />
					<Input
						className="pl-9"
						name="projectCodeSearch"
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search tracked files"
						value={query}
					/>
				</label>
			</div>
			<div className="grid min-h-[32rem] gap-0 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
				<aside className="border-b border-neutral-200 p-3 lg:border-r lg:border-b-0 dark:border-neutral-800">
					<CodeFileTree
						files={files}
						onSelect={selectFile}
						query={query}
						selectedPath={selectedPath}
					/>
				</aside>
				<section className="min-w-0">
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

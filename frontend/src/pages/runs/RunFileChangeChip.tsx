import type { ReactNode } from 'react';

import type { RunFileChangeSource } from '../../api/types.ts';

import { Tooltip } from '../../components/ui/tooltip.tsx';
import { buildRunFileChangeTooltipModel, type RunFileChangeKind } from './runFileChangeTooltip.ts';

function FileChangeTooltipContent({
	kind,
	paths,
	source,
	truncated,
}: {
	kind: RunFileChangeKind;
	paths: readonly string[];
	source: RunFileChangeSource;
	truncated: boolean;
}) {
	const model = buildRunFileChangeTooltipModel({ kind, paths, source, truncated });
	return (
		<div className="space-y-2">
			<div className="font-medium text-foreground">{model.title}</div>
			<p className="text-[0.7rem] leading-snug text-muted-foreground">{model.sourceNote}</p>
			{model.paths.length > 0 ? (
				<ul className="max-h-64 space-y-1 overflow-auto pr-1">
					{model.paths.map((path) => (
						<li
							className="rounded-sm bg-muted/80 px-1.5 py-1 font-mono text-[0.68rem] leading-snug break-all text-foreground"
							key={path}>
							{path}
						</li>
					))}
				</ul>
			) : null}
			{model.truncatedNote ? (
				<p className="text-[0.7rem] leading-snug text-muted-foreground">
					{model.truncatedNote}
				</p>
			) : null}
			<p className="text-[0.7rem] leading-snug text-muted-foreground">{model.countNote}</p>
		</div>
	);
}

/** The "N files created / edited" chip in the run detail panel, with its path-list tooltip. */
export function FileChangeChip({
	children,
	kind,
	paths,
	source,
	truncated,
}: {
	children: ReactNode;
	kind: RunFileChangeKind;
	paths: readonly string[];
	source: RunFileChangeSource;
	truncated: boolean;
}) {
	return (
		<Tooltip
			className="!w-[min(34rem,calc(100vw-2rem))] !max-w-none p-3"
			content={
				<FileChangeTooltipContent
					kind={kind}
					paths={paths}
					source={source}
					truncated={truncated}
				/>
			}
			disclosure
			disclosureLabel={`${kind === 'created' ? 'Created' : 'Edited'} file paths and recording details`}>
			<span className="inline-flex items-center gap-1 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
				{children}
			</span>
		</Tooltip>
	);
}

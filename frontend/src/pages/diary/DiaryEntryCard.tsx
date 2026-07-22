import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { DiaryEntry } from '../../api/types.ts';

import { MarkdownContent } from '../../components/shared/MarkdownContent.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { formatDate } from '../../lib/formatters.ts';

export function DiaryEntryCard({
	entry,
	showProject = false,
}: {
	entry: DiaryEntry;
	showProject?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	return (
		<Card variant="panel">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="mb-1 flex flex-wrap items-center gap-2">
						{showProject ? (
							<Link
								className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300"
								to={`/projects/${encodeURIComponent(entry.projectId)}`}>
								{entry.projectName}
							</Link>
						) : null}
						{entry.phase ? <Badge tone="cyan">{entry.phase}</Badge> : null}
						<span
							className="text-xs text-neutral-500"
							title={formatDate(`${entry.date}T00:00:00`)}>
							{entry.date}
						</span>
					</div>
					<h3 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
						{entry.title}
					</h3>
					{entry.summary ? (
						<p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
							{entry.summary}
						</p>
					) : null}
				</div>
				<Button
					onClick={() => setExpanded((prev) => !prev)}
					size="compact"
					variant="secondary">
					{expanded ? 'Hide' : 'Read entry'}
				</Button>
			</div>
			{expanded ? (
				<div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
					<MarkdownContent markdown={entry.bodyMd} />
					{entry.generatedBy ? (
						<Link
							className="mt-3 inline-block text-xs text-neutral-500 hover:underline"
							to={`/pipeline-sessions/${entry.generatedBy}`}>
							View generating run
						</Link>
					) : null}
				</div>
			) : null}
		</Card>
	);
}

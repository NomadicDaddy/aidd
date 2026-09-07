import { useId, useState } from 'react';
import { Link } from 'react-router';

import type { DiaryEntry } from '../../api/types.ts';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { MarkdownContent } from '../../components/shared/MarkdownContent.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { proseMeasureClass } from '../../lib/typography.ts';

export function DiaryEntryCard({
	entry,
	showProject = false,
}: {
	entry: DiaryEntry;
	showProject?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const detailsId = useId();
	return (
		<Card variant="panel">
			<div className="min-w-0">
				<div className="mb-1 flex flex-wrap items-center gap-2">
					{showProject ? (
						<Link
							className={`text-xs text-muted-foreground hover:text-accent hover:underline ${touchTargetTextClass}`}
							to={`/projects/${encodeURIComponent(entry.projectId)}`}>
							{entry.projectName}
						</Link>
					) : null}
					{entry.phase ? <Badge tone="neutral">{entry.phase}</Badge> : null}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<h3 className="text-base font-semibold break-words text-foreground">
						{entry.title}
					</h3>
					<Button
						aria-controls={detailsId}
						aria-expanded={expanded}
						aria-label={`${expanded ? 'Hide entry' : 'Read entry'}: ${entry.title}`}
						onClick={() => setExpanded((prev) => !prev)}
						size="compact"
						variant="secondary">
						<DisclosureMarker open={expanded} />
						{expanded ? 'Hide' : 'Read entry'}
					</Button>
				</div>
				{entry.summary ? (
					<p className={`mt-1 text-sm break-words text-foreground ${proseMeasureClass}`}>
						{entry.summary}
					</p>
				) : null}
			</div>
			{expanded ? (
				<div className="mt-3 border-t border-border pt-3" id={detailsId}>
					{/* `idPrefix`: the timeline expands many entries into one document, and two
					    entries that both open with a "Summary" heading would otherwise claim the
					    same id — the first takes every anchor and the second is unreachable. */}
					<MarkdownContent
						baseLevel={4}
						idPrefix={entry.id}
						markdown={entry.bodyMd}
						measure="prose"
						variant="embedded"
					/>
					{entry.generatedBy ? (
						<Link
							className={`mt-3 text-xs text-muted-foreground hover:underline ${touchTargetTextClass}`}
							to={`/pipeline-sessions/${entry.generatedBy}`}>
							View generating run
						</Link>
					) : null}
				</div>
			) : null}
		</Card>
	);
}

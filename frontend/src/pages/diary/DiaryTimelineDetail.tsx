import { useId, useState } from 'react';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { MarkdownContent } from '../../components/shared/MarkdownContent.tsx';
import { Button } from '../../components/ui/button.tsx';
import { cn } from '../../lib/cn.ts';
import { useClampedContent } from './useClampedContent.ts';

const AI_SUMMARY_MAX_CHARS = 400;

export function DiaryTimelineDetail({ detail, itemId }: { detail: string; itemId: string }) {
	const [expanded, setExpanded] = useState(false);
	const detailId = useId();
	const renderedDetail =
		detail.length === AI_SUMMARY_MAX_CHARS && !detail.endsWith('…') ? `${detail}…` : detail;
	const sourceTruncated = detail.length === AI_SUMMARY_MAX_CHARS;
	const { clamped, containerRef } = useClampedContent(expanded, renderedDetail);

	return (
		<div className="@container">
			<div className="relative z-10 mt-1 items-end gap-2 @min-[45rem]:grid @min-[45rem]:grid-cols-[minmax(0,1fr)_auto]">
				<div id={detailId} ref={containerRef}>
					<MarkdownContent
						baseLevel={4}
						className={cn('text-muted-foreground', !expanded && 'line-clamp-2')}
						idPrefix={itemId}
						markdown={renderedDetail}
						// The row is the container and the two-line clamp is the cap. This used to be
						// four `max-w-none` overrides cancelling a measure the renderer applied
						// unconditionally; the width is unchanged, the override is not.
						measure="prose"
					/>
				</div>
				{clamped || sourceTruncated || expanded ? (
					<Button
						aria-controls={detailId}
						aria-expanded={expanded}
						className="mt-1 @min-[45rem]:mt-0"
						onClick={() => setExpanded((current) => !current)}
						size="compact"
						variant="ghost">
						<DisclosureMarker open={expanded} />
						{expanded
							? 'Collapse summary'
							: sourceTruncated
								? 'Show available summary'
								: 'Read full summary'}
					</Button>
				) : null}
			</div>
		</div>
	);
}

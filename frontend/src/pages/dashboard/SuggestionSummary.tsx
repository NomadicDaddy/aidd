import { useId, useState } from 'react';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { Button } from '../../components/ui/button.tsx';

export function SuggestionSummary({
	description,
	meta,
	title,
}: {
	description: string;
	meta: string;
	title: string;
}) {
	const [expanded, setExpanded] = useState(false);
	const descriptionId = useId();
	return (
		<div className="min-w-0">
			<h3 className="line-clamp-2 text-sm font-semibold text-foreground">{title}</h3>
			<p className="mt-1 truncate text-xs text-muted-foreground">{meta}</p>
			<p
				className={`mt-1 text-xs whitespace-pre-wrap text-muted-foreground ${expanded ? '' : 'line-clamp-2'}`}
				id={descriptionId}>
				{description}
			</p>
			<Button
				aria-controls={descriptionId}
				aria-expanded={expanded}
				aria-label={`${expanded ? 'Collapse' : 'Read full'} suggestion: ${title}`}
				className="mt-1"
				onClick={() => setExpanded((value) => !value)}
				size="compact"
				variant="ghost">
				<DisclosureMarker open={expanded} />
				{expanded ? 'Show less' : 'Read full suggestion'}
			</Button>
		</div>
	);
}

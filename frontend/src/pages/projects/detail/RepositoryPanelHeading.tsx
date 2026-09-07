import { Badge } from '../../../components/ui/badge.tsx';
import { CardHeader } from '../../../components/ui/card.tsx';

export function RepositoryPanelHeading({
	count,
	description,
	title,
}: {
	count?: number;
	description?: string | undefined;
	title: string;
}) {
	return (
		<CardHeader
			badge={
				count === undefined ? undefined : (
					<Badge tone="neutral">{count.toLocaleString()}</Badge>
				)
			}
			className="mb-0"
			description={description}
			headingLevel={4}
			level="subsection"
			title={title}
		/>
	);
}

import type { ReactNode } from 'react';

export function highlightedMatch(label: string, query: string): ReactNode {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return label;
	const matchStart = label.toLocaleLowerCase().indexOf(normalizedQuery);
	if (matchStart === -1) return label;
	const matchEnd = matchStart + normalizedQuery.length;

	return (
		<>
			{label.slice(0, matchStart)}
			<mark className="bg-accent-muted font-semibold text-accent-muted-foreground">
				{label.slice(matchStart, matchEnd)}
			</mark>
			{label.slice(matchEnd)}
		</>
	);
}

import type { ReactNode } from 'react';

interface RenderedDefinition {
	definition: ReactNode;
	term: ReactNode;
}

export function MarkdownDefinitionList({ entries }: { entries: RenderedDefinition[] }) {
	return (
		<dl className="divide-y divide-border border-y border-border">
			{entries.map(({ definition, term }, index) => (
				<div className="py-3 first:pt-2 last:pb-2" key={index}>
					<dt className="font-semibold text-foreground">{term}</dt>
					<dd className="mt-1 text-muted-foreground">{definition}</dd>
				</div>
			))}
		</dl>
	);
}

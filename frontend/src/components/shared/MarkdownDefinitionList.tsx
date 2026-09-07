import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { definitionTermClass } from '../../lib/typography.ts';

interface RenderedDefinition {
	definition: ReactNode;
	id: string | undefined;
	term: ReactNode;
	termLabel: string;
}

export function MarkdownDefinitionList({ entries }: { entries: RenderedDefinition[] }) {
	return (
		<dl className="@container/definitions grid gap-4 pt-2 pb-4">
			{entries.map(({ definition, id, term, termLabel }, index) => (
				<div
					className="grid gap-1 @min-[36rem]/definitions:grid-cols-[12rem_minmax(0,1fr)] @min-[36rem]/definitions:gap-x-5"
					key={id ?? index}>
					<dt
						aria-label={termLabel}
						className={cn(
							id !== undefined && 'group scroll-mt-20',
							definitionTermClass,
						)}
						id={id}>
						{term}
						{id !== undefined ? (
							<>
								{' '}
								<a
									aria-label={`Link to term ${termLabel}`}
									className={cn(
										touchTargetTextClass,
										'text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent focus-visible:opacity-100',
									)}
									href={`#${id}`}>
									#
								</a>
							</>
						) : null}
					</dt>
					<dd className="text-foreground">{definition}</dd>
				</div>
			))}
		</dl>
	);
}

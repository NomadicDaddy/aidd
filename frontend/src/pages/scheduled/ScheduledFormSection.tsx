import type { ReactNode } from 'react';

import { useId } from 'react';

import { CardHeader } from '../../components/ui/card.tsx';
import { toneText } from '../../lib/tones.ts';

export function ScheduledFormSection({
	children,
	required = false,
	title,
}: {
	children: ReactNode;
	required?: boolean;
	title: string;
}) {
	const titleId = useId();

	return (
		<section aria-labelledby={titleId} className="space-y-3 border-t border-border pt-4">
			<CardHeader
				className="mb-0"
				headingLevel={3}
				id={titleId}
				level="subsection"
				title={
					<>
						{title}
						{required ? (
							<span aria-hidden="true" className={toneText.red}>
								{' *'}
							</span>
						) : null}
					</>
				}
			/>
			{children}
		</section>
	);
}

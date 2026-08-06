import { Link } from 'react-router';

import { Metric } from '../../components/shared/Metric.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';

const metadata: { label: string; value: string }[] = [
	{ label: 'Version', value: __AIDD_VERSION__ },
	{ label: 'Interface', value: 'Control panel' },
	{ label: 'Runtime', value: 'Bun' },
];

export function AboutPage() {
	useDocumentTitle('About');

	return (
		// The same `page-reveal space-y-5` shell as the other twenty routes. This page used to centre
		// itself in a `max-w-4xl` column at a different vertical rhythm, so navigating to it moved
		// every landmark on screen — and it was the only route with no PageHeader at all.
		<div className="page-reveal space-y-5">
			<PageHeader
				actions={
					// The two links were a card of their own below the fold. The actions slot is
					// where every other route puts exactly this kind of pair.
					<div className="flex flex-wrap gap-2">
						<Link className={buttonClassName('secondary')} to="/docs">
							Read the docs
						</Link>
						{__AIDD_REPOSITORY_URL__ !== '' && (
							<a
								className={buttonClassName('secondary')}
								href={__AIDD_REPOSITORY_URL__}
								rel="noreferrer"
								target="_blank">
								Source repository
							</a>
						)}
					</div>
				}
				description="AI Development Director"
				title="aidd"
			/>
			{/* What is left of the hero: the mark at a size that identifies the app rather than one
			    that fills a viewport, on a plain panel. The radial-gradient wash, the two blur
			    overlays and the `shadow-lg` are gone — they were the only ones on any route — and
			    the logo was serving as the page's `h1`, which is now real text in the header. */}
			<Card className="flex flex-col items-center gap-4 py-8 text-center" variant="panel">
				<img
					alt=""
					className="h-32 w-32 rounded-[1.5rem] object-cover ring-1 ring-border sm:h-40 sm:w-40"
					decoding="async"
					height="512"
					src="/web-app-manifest-512x512.png"
					width="512"
				/>
				<p className="max-w-prose text-sm text-muted-foreground">
					A control panel for running, watching and auditing AI development work across
					your projects.
				</p>
			</Card>
			{/* Three labelled figures, so they are three `Metric`s — the same tiles the dashboard
			    uses rather than a fourth divergent copy of the pattern. */}
			<div className="grid gap-3 sm:grid-cols-3">
				{metadata.map(({ label, value }) => (
					<Metric key={label} label={label} size="compact" value={value} />
				))}
			</div>
		</div>
	);
}

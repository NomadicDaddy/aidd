import type { ReactNode } from 'react';

import { Link } from 'react-router';

import { Metric } from '../../components/shared/Metric.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { proseMeasureClass } from '../../lib/typography.ts';

// The version is the one machine string on this page, so it is the one that renders in mono —
// wrapped here rather than by changing `Metric`, whose `font-display tabular-nums` is right for the
// counts every other tile in the app carries. A child's `font-family` wins over the tile's, and
// `tabular-nums` still inherits. INTERFACE and RUNTIME are prose and keep the display face, which
// is also what makes the machine string visibly distinct from the two that are not.
const metadata: { label: string; value: ReactNode }[] = [
	{ label: 'Version', value: <span className="font-mono">{__AIDD_VERSION__}</span> },
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
			{/* `title="About"`, so the highlighted rail item has a counterpart on the page. This was
			    the one top-level route whose h1 did not echo its nav label, and the h1 repeated the
			    wordmark already sitting in the rail 234px to its left. The product name moves into
			    the description, leaving the rail as the single place the app names itself. */}
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
				description="aidd — AI Development Director"
				title="About"
			/>
			{/* What is left of the hero: the mark at a size that identifies the app rather than one
			    that fills a viewport, on a plain panel. The radial-gradient wash, the two blur
			    overlays and the `shadow-lg` are gone — they were the only ones on any route — and
			    the logo was serving as the page's `h1`, which is now real text in the header.

				    A left-aligned row, not a centred column: centred inside a 1962px panel, the mark
				    landed 981px right of the h1 left edge, so the eye crossed the width of a 1024px
				    viewport to get from the page title to the page mark and back. On one left axis
				    with the h1 and the tiles, the panel is sized by its content rather than by the
				    viewport, and `py-8` drops back to the house card padding. */}
			<Card className="flex flex-wrap items-center gap-4" variant="panel">
				<img
					alt=""
					className="h-16 w-16 shrink-0 rounded-[1rem] object-cover ring-1 ring-border"
					decoding="async"
					height="512"
					src="/web-app-manifest-512x512.png"
					width="512"
				/>
				{/* `proseMeasureClass`, not Tailwind's built-in `max-w-prose`: the app declares its
				    own reading measure and this was one of three sites opting out of it for a
				    near-identical built-in. */}
				<p className={`text-sm text-muted-foreground ${proseMeasureClass}`}>
					A control panel for running, watching and auditing AI development work across
					your projects.
				</p>
			</Card>
			{/* Three labelled figures, so they are three `Metric`s — the same tiles the dashboard
			    uses rather than a fourth divergent copy of the pattern. */}
			<div className="grid max-w-3xl gap-3 sm:grid-cols-3">
				{metadata.map(({ label, value }) => (
					<Metric key={label} label={label} size="compact" value={value} />
				))}
			</div>
		</div>
	);
}

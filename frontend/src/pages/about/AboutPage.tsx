import { Link } from 'react-router';

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
		<div className="page-reveal flex min-h-[calc(100vh-7rem)] items-center justify-center px-2 py-8 sm:px-6">
			<section aria-labelledby="about-title" className="w-full max-w-4xl space-y-4">
				<Card
					className="relative isolate flex flex-col items-center overflow-hidden px-5 py-10 text-center sm:px-10 sm:py-14"
					variant="panel">
					{/* The atmosphere is an aria-hidden overlay on the accent token rather than
					    hand-picked teal/amber stops, so the hero re-themes with everything else. */}
					<div
						aria-hidden="true"
						className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,var(--color-accent-muted),transparent_38%),radial-gradient(circle_at_76%_30%,var(--color-accent-muted),transparent_34%)] opacity-80"
					/>
					<div
						aria-hidden="true"
						className="absolute inset-x-8 top-8 -z-10 h-36 rounded-full bg-accent/15 blur-3xl"
					/>
					<div className="relative">
						<div
							aria-hidden="true"
							className="absolute inset-8 rounded-full bg-accent/20 blur-2xl"
						/>
						<img
							alt="aidd"
							className="relative h-48 w-48 rounded-[2rem] object-cover shadow-lg ring-1 ring-border/60 sm:h-64 sm:w-64"
							decoding="async"
							height="512"
							src="/web-app-manifest-512x512.png"
							width="512"
						/>
					</div>
					<div className="mt-8 grid gap-3">
						{/* The wordmark is the page's title, so it is the page's `h1`: as a
						    paragraph it left /about with no heading in its main landmark at all. */}
						<h1
							className="font-display text-5xl font-semibold text-foreground sm:text-7xl"
							id="about-title"
							translate="no">
							aidd
						</h1>
						<p className="text-base font-medium text-accent sm:text-lg">
							AI Development Director
						</p>
					</div>
				</Card>
				{/* The hero card was 896px wide holding a 180px column; this is the console metadata
				    that width was always implying. */}
				<Card className="p-5" variant="sunken">
					<dl className="grid gap-x-6 gap-y-2 font-mono text-xs sm:grid-cols-3">
						{metadata.map(({ label, value }) => (
							<div key={label}>
								<dt className="text-muted-foreground uppercase">{label}</dt>
								<dd className="mt-0.5 text-foreground">{value}</dd>
							</div>
						))}
					</dl>
					<div className="mt-5 flex flex-wrap gap-2">
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
				</Card>
			</section>
		</div>
	);
}

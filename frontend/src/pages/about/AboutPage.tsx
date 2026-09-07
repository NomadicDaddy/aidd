import { Link } from 'react-router';

import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { formatDate } from '../../lib/formatters.ts';
import { microLabelClass } from '../../lib/typography.ts';

const PAGE_RAIL = pageRailByContentType.reading;

export function AboutPage() {
	useDocumentTitle('About');

	return (
		<PageRail className="page-reveal space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				actions={
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
				description="Product identity and the frontend build this instance is serving."
				title="About"
			/>
			<Card className="@container" variant="panel">
				{/* Measured on this Card: 358px inside a 390px viewport, 328px inside a 360px one,
				    then 656px at 768 and 976px at 1440 — nothing lands between. A 22rem step fell
				    between the two phone measurements, so one handset width put the 80px mark beside
				    the title and the other stacked it, for no reason a reader could see. Stacked is
				    the phone branch: in a row at 358px the mark and its gap take 96px, leaving 262px
				    for a description sentence and a version list whose label track is max-content.
				    28rem sits in the empty span between the widest phone and the narrowest tablet, so
				    every phone stacks and every wider container keeps the row it already had. */}
				<div className="grid items-start gap-4 @min-[28rem]:grid-cols-[5rem_minmax(0,1fr)] @min-[48rem]:grid-cols-[5rem_minmax(0,1fr)_max-content]">
					<img
						alt=""
						className="h-20 w-20 shrink-0 rounded-[1rem] object-cover ring-1 ring-border"
						decoding="async"
						height="512"
						src="/web-app-manifest-512x512.png"
						width="512"
					/>
					<div className="min-w-0 @min-[28rem]:self-center">
						{/* One description, in the slot that declares one. The tagline was in the slot and
						    the sentence explaining it was a sibling paragraph at a different size, so the
						    header read as two muted registers stacked on each other. */}
						<CardHeader
							className="mb-0"
							description="AI Development Director — a control panel for running, watching and auditing AI development work across your projects."
							descriptionClassName="text-sm leading-relaxed"
							title="aidd"
						/>
					</div>
					<dl className="grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm @min-[28rem]:col-start-2 @min-[48rem]:col-start-3 @min-[48rem]:row-start-1 @min-[48rem]:self-center">
						<dt className={`${microLabelClass} text-muted-foreground`}>Version</dt>
						<dd className="min-w-0 font-mono text-foreground">{__AIDD_VERSION__}</dd>
						<dt className={`${microLabelClass} text-muted-foreground`}>Revision</dt>
						<dd className="min-w-0 font-mono text-foreground">
							{__AIDD_BUILD_REVISION__}
						</dd>
						<dt className={`${microLabelClass} text-muted-foreground`}>Built</dt>
						<dd className="min-w-0 font-mono text-foreground">
							<time dateTime={__AIDD_BUILD_TIMESTAMP__}>
								{formatDate(__AIDD_BUILD_TIMESTAMP__)}
							</time>
						</dd>
					</dl>
				</div>
			</Card>
		</PageRail>
	);
}

import { FRONTEND_ROUTE_PATHS } from 'aidd-shared/contracts/frontend-routes';
import { Link } from 'react-router';

import {
	type ExecutionIdentity,
	ExecutionIdentityBadges,
} from '../../components/shared/ExecutionIdentityBadges.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Badge, StatusDot } from '../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { cn } from '../../lib/cn.ts';
import {
	executionIdentityCliCatalog,
	executionIdentityModelCatalog,
	executionIdentityReasoningCatalog,
} from '../../lib/executionIdentity.ts';
import { type Tone } from '../../lib/tones.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { ExecutionIdentityCatalogSections } from './ExecutionIdentityCatalogSections.tsx';

const toneCatalog: readonly Tone[] = ['emerald', 'teal', 'amber', 'red', 'violet', 'neutral'];

const representativeIdentities: readonly {
	description: string;
	identity: ExecutionIdentity;
	label: string;
}[] = [
	{
		description: 'A complete coding-run identity.',
		identity: { backend: 'codex', model: 'gpt-5.6-sol', reasoningEffort: 'high' },
		label: 'Production run',
	},
	{
		description: 'Provider context remains available in the tooltip.',
		identity: {
			backend: 'native',
			model: 'glm-5.2',
			provider: 'zhipu',
			reasoningEffort: 'medium',
		},
		label: 'Provider-backed run',
	},
	{
		description: 'Custom values use the same neutral treatment and truncate safely.',
		identity: {
			backend: 'opencode',
			model: 'organization/research-preview-model-with-an-intentionally-long-name',
			reasoningEffort: 'provider-specific',
		},
		label: 'Custom long identity',
	},
	{
		description: 'Partial metadata still renders without empty segments.',
		identity: { backend: 'ollama' },
		label: 'Partial identity',
	},
];

/**
 * The specimen that was missing.
 *
 * Every other specimen on this page renders at its natural width, so the component looked correct
 * here while shipping `co…  gpt-5…  hi…` in a 179px table cell. These three widths are the real
 * column budgets: Runs' MODEL column, the Pipeline Sessions history cell, and the narrowest place
 * an identity is asked to render at all.
 */
const constrainedWidths = [
	// `shrink-0` is load-bearing: these are flex items, so without it the wider budgets collapse to
	// whatever the cell has left and render at an identical width — a constrained-width specimen
	// that is not actually constrained to the width it is labelled with.
	//
	// 179px, not the 160px this list used to carry: 179 is the Runs MODEL column the docstring above
	// names as the real budget, and the sheet was never exercising it. 96px is the tight step that
	// row was meant to be — at 160px the Production badge measured 153px and rendered identically to
	// its own 240px row, so two of three rows were showing the same outcome.
	{ className: 'w-[240px] shrink-0', label: '240px' },
	{ className: 'w-[179px] shrink-0', label: '179px' },
	{ className: 'w-[120px] shrink-0', label: '120px' },
	{ className: 'w-[96px] shrink-0', label: '96px' },
] as const;

function ConstrainedSpecimens({ identity, label }: { identity: ExecutionIdentity; label: string }) {
	return (
		<div className="min-w-0">
			<CardHeader className="mb-2" headingLevel={3} level="subsection" title={label} />
			{/* Side by side, not stacked. Stacked, the 240px, 179px and 120px results sat 768px
			    apart down a 948px row on the one section whose entire job is comparing them; the
			    budgets together total 635px and wrap as a set when the cell is narrower. */}
			<div className="flex flex-wrap items-start gap-4">
				{constrainedWidths.map((width) => (
					<div className="min-w-0" key={width.label}>
						<div className="mb-1 font-mono text-xs text-muted-foreground">
							{width.label}
						</div>
						<div className={cn('min-w-0 overflow-hidden', width.className)}>
							<ExecutionIdentityBadges {...identity} variant="compact" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function ExecutionIdentityBadgeLabPage() {
	useDocumentTitle('Execution Identity Badge Lab');
	return (
		<div className="page-reveal space-y-5">
			<PageHeader
				breadcrumb={
					<Link
						className={`hover:underline ${touchTargetTextClass}`}
						to={FRONTEND_ROUTE_PATHS.settings}>
						Settings
					</Link>
				}
				description={`${executionIdentityCliCatalog.length} CLIs · ${executionIdentityModelCatalog.length} models · ${executionIdentityReasoningCatalog.length} reasoning levels`}
				title="Execution Identity Badge Lab"
			/>

			<Card className="text-sm text-muted-foreground" variant="sunken">
				{/* The card keeps its full-width surface; only the text run is capped. Uncapped it
				    set 182 characters as one 1167px line at 2250x1309, roughly 2.7x the measure the
				    app declares for prose. */}
				<p className={proseMeasureClass}>
					Execution identity is quiet operational metadata. One neutral treatment keeps
					the backend, model, and reasoning effort readable without competing with
					statuses, warnings, or actions.
				</p>
			</Card>

			<Card aria-labelledby="badge-lab-representative" className="overflow-hidden p-0">
				<section className="@container">
					<CardHeader
						className="mb-0 border-b border-border px-4 py-3"
						description="Composed examples exercise production, provider, custom, and partial data."
						id="badge-lab-representative"
						title="Representative identities"
					/>
					{/* A third step, so all four specimens sit in one comparable row once there is
					    room for it. At two columns and 1962px the cells measured 980px against
					    badges of 226, 223, 454 and 75px — up to 872px of empty cell each, on a
					    sheet whose whole job is side-by-side comparison. */}
					<div className="grid gap-px bg-border @min-[32rem]:grid-cols-2 @min-[61rem]:grid-cols-4">
						{representativeIdentities.map(({ description, identity, label }) => (
							<div className="min-w-0 bg-card p-4" key={label}>
								{/* The card contract's own subsection step, not a hand-rolled
								    `text-sm font-medium` — a third 14px weight at the same size as
								    the sanctioned one is exactly what `headerLevels` exists to
								    prevent. */}
								<CardHeader
									className="mb-2"
									description={description}
									headingLevel={3}
									level="subsection"
									title={label}
								/>
								<ExecutionIdentityBadges {...identity} />
							</div>
						))}
					</div>
				</section>
			</Card>

			<Card aria-labelledby="badge-lab-constrained" className="overflow-hidden p-0">
				<section className="@container">
					<CardHeader
						className="mb-0 border-b border-border px-4 py-3"
						description="The compact variant at the column budgets it actually has to survive. A specimen page that only shows the component at its natural width cannot fail."
						id="badge-lab-constrained"
						title="Constrained widths"
					/>
					{/* 44rem, not the 32rem the section above uses: these cells hold a specimen
					    pinned at 240px plus a 48px label and a 12px gap inside 16px of card
					    padding, so a two-column split needs 704px of section width before the
					    240px row stops overflowing. A grid that clipped the widest specimen would
					    defeat the point of the section. */}
					<div className="grid gap-px bg-border @min-[44rem]:grid-cols-2">
						{representativeIdentities.slice(0, 2).map(({ identity, label }) => (
							<div className="bg-card p-4" key={label}>
								<ConstrainedSpecimens identity={identity} label={label} />
							</div>
						))}
					</div>
				</section>
			</Card>

			{/* The lab is treated as the place that settles what a shared mark looks like, and it
			    was silent on the status dot while eight call sites hand-rolled their own at 8px
			    against the component's 6px. Both rows render the same `StatusDot`, so the size
			    cannot drift between the badge and the bare dot without showing up here. */}
			<Card aria-labelledby="badge-lab-status-dots" className="overflow-hidden p-0">
				<section>
					<CardHeader
						className="mb-0 border-b border-border px-4 py-3"
						description="The one status dot, at 6px, in every tone — inside a badge and standing alone. Nothing else in the app is allowed to draw its own."
						id="badge-lab-status-dots"
						title="Status dots"
					/>
					<div className="space-y-3 p-4">
						<div className="flex flex-wrap items-center gap-2">
							{toneCatalog.map((tone) => (
								<Badge key={tone} showDot tone={tone}>
									{tone}
								</Badge>
							))}
						</div>
						<div className="flex flex-wrap items-center gap-4">
							{toneCatalog.map((tone) => (
								<span
									className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
									key={tone}>
									<StatusDot tone={tone} />
									{tone}
								</span>
							))}
							<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
								<StatusDot pulse tone="teal" />
								pulse
							</span>
						</div>
					</div>
				</section>
			</Card>

			<ExecutionIdentityCatalogSections />
		</div>
	);
}

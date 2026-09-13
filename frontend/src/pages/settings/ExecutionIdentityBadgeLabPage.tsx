import { FRONTEND_ROUTE_PATHS } from 'aidd-shared/contracts/frontend-routes';

import type { Tone } from '../../lib/tones.ts';

import {
	type ExecutionIdentity,
	ExecutionIdentityBadges,
} from '../../components/shared/ExecutionIdentityBadges.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { Badge, StatusDot } from '../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import {
	executionIdentityCliCatalog,
	executionIdentityModelCatalog,
	executionIdentityReasoningCatalog,
} from '../../lib/executionIdentity.ts';
import { microLabelClass } from '../../lib/typography.ts';
import { ExecutionIdentityCatalogSections } from './ExecutionIdentityCatalogSections.tsx';
import { ConstrainedSpecimens } from './ExecutionIdentityConstrainedSpecimens.tsx';

const PAGE_RAIL = pageRailByContentType.catalog;

const toneCatalog: readonly { label: string; tone: Tone }[] = [
	{ label: 'Healthy', tone: 'emerald' },
	{ label: 'Informational', tone: 'teal' },
	{ label: 'Needs attention', tone: 'amber' },
	{ label: 'Failure', tone: 'red' },
	{ label: 'System-managed', tone: 'violet' },
	{ label: 'Inert', tone: 'neutral' },
];

const representativeIdentities: readonly {
	description: string;
	identity: ExecutionIdentity;
	label: string;
}[] = [
	{
		description: 'A complete coding-run identity.',
		identity: { backend: 'codex', model: 'gpt-6-astra', reasoningEffort: 'high' },
		label: 'Production run',
	},
	{
		description: 'Provider context remains available in the tooltip.',
		identity: {
			backend: 'native',
			model: 'glm-5.3',
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
export function ExecutionIdentityBadgeLabPage() {
	useDocumentTitle('Execution Identity Badge Lab');
	return (
		<PageRail className="page-reveal space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				breadcrumb={{ label: 'Settings', to: FRONTEND_ROUTE_PATHS.settings }}
				description={`${executionIdentityCliCatalog.length} CLIs · ${executionIdentityModelCatalog.length} models · ${executionIdentityReasoningCatalog.length} reasoning levels. Execution identity is quiet operational metadata; one neutral treatment keeps it readable without competing with statuses, warnings, or actions.`}
				title="Execution Identity Badge Lab"
			/>
			<Card className="overflow-hidden p-0">
				<section aria-labelledby="badge-lab-representative" className="@container">
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

			<Card className="overflow-hidden p-0">
				<section aria-labelledby="badge-lab-constrained" className="@container">
					<CardHeader
						className="mb-0 border-b border-border px-4 py-3"
						description="The compact variant at the column budgets it actually has to survive. Phone badges suppress decorative CLI and reasoning icons so the identifying text keeps the available width."
						id="badge-lab-constrained"
						title="Constrained widths"
					/>
					{/* 44rem, not the 32rem the section above uses: these cells hold a specimen
					    pinned at 240px plus a 48px label and a 12px gap inside 16px of card
					    padding, so a two-column split needs 704px of section width before the
					    240px row stops overflowing. A grid that clipped the widest specimen would
					    defeat the point of the section. */}
					<div className="grid gap-px bg-border @min-[44rem]:grid-cols-2">
						{representativeIdentities.map(({ identity, label }) => (
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
			<Card className="overflow-hidden p-0">
				<section aria-labelledby="badge-lab-status-dots">
					<CardHeader
						className="mb-0 border-b border-border px-4 py-3"
						description="The one status dot, at 6px, in every tone — inside a badge and standing alone. Nothing else in the app is allowed to draw its own."
						id="badge-lab-status-dots"
						title="Status dots"
					/>
					<div className="space-y-3 p-4">
						<div className="flex flex-wrap items-center gap-2">
							{toneCatalog.map(({ label, tone }) => (
								<div className="space-y-1" key={tone}>
									<Badge showDot tone={tone}>
										{label}
									</Badge>
									<div className={`${microLabelClass} text-muted-foreground`}>
										{tone}
									</div>
								</div>
							))}
						</div>
						<div className="flex flex-wrap items-center gap-4">
							{toneCatalog.map(({ label, tone }) => (
								<span
									className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
									key={tone}>
									<StatusDot tone={tone} />
									{label}
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
		</PageRail>
	);
}

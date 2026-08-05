import type { ReactNode } from 'react';

import { FRONTEND_ROUTE_PATHS } from 'aidd-shared/contracts/frontend-routes';
import { Link } from 'react-router';

import {
	type ExecutionIdentity,
	ExecutionIdentityBadges,
} from '../../components/shared/ExecutionIdentityBadges.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { backendLabel, backendOptions } from '../../lib/backends.ts';
import { cn } from '../../lib/cn.ts';
import {
	executionIdentityModelCatalog,
	executionIdentityReasoningCatalog,
} from '../../lib/executionIdentity.ts';

const cliCatalog = [...backendOptions.map(({ value }) => value), 'direct'] as const;

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
	{ className: 'w-[240px]', label: '240px' },
	{ className: 'w-[160px]', label: '160px' },
	{ className: 'w-[120px]', label: '120px' },
] as const;

function ConstrainedSpecimens({ identity, label }: { identity: ExecutionIdentity; label: string }) {
	return (
		<div className="min-w-0 space-y-2">
			<h3 className="text-sm font-medium text-foreground">{label}</h3>
			{constrainedWidths.map((width) => (
				<div className="flex items-center gap-3" key={width.label}>
					<span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
						{width.label}
					</span>
					<div className={cn('min-w-0 overflow-hidden', width.className)}>
						<ExecutionIdentityBadges {...identity} variant="compact" />
					</div>
				</div>
			))}
		</div>
	);
}

function CatalogGroup({
	children,
	description,
	id,
	title,
}: {
	children: ReactNode;
	description: string;
	id: string;
	title: string;
}) {
	return (
		<Card aria-labelledby={id}>
			<section>
				<CardHeader className="mb-3" description={description} id={id} title={title} />
				<div className="flex flex-wrap items-center gap-2">{children}</div>
			</section>
		</Card>
	);
}

/**
 * The CLI catalog's stacked prose label restated the chip for most entries — "Ollama" over
 * "ollama". It survives only where the display name is genuinely different, and inline, so all
 * three catalog groups render as one flex-wrap chip row.
 */
function cliDisplayLabel(cli: string): null | string {
	const label = cli === 'direct' ? 'Direct AI' : backendLabel(cli);
	return label.toLowerCase() === cli.toLowerCase() ? null : label;
}

export function ExecutionIdentityBadgeLabPage() {
	useDocumentTitle('Execution Identity Badge Lab');
	return (
		<div className="page-reveal space-y-5">
			<PageHeader
				breadcrumb={
					<Link className="hover:underline" to={FRONTEND_ROUTE_PATHS.settings}>
						Settings
					</Link>
				}
				description={`${cliCatalog.length} CLIs · ${executionIdentityModelCatalog.length} models · ${executionIdentityReasoningCatalog.length} reasoning levels`}
				title="Execution Identity Badge Lab"
			/>

			<Card className="text-sm text-muted-foreground" variant="sunken">
				Execution identity is quiet operational metadata. One neutral treatment keeps the
				backend, model, and reasoning effort readable without competing with statuses,
				warnings, or actions.
			</Card>

			<Card aria-labelledby="badge-lab-representative" className="overflow-hidden p-0">
				<section>
					<CardHeader
						className="mb-0 border-b border-border px-4 py-3"
						description="Composed examples exercise production, provider, custom, and partial data."
						id="badge-lab-representative"
						title="Representative identities"
					/>
					<div className="grid gap-px bg-border sm:grid-cols-2">
						{representativeIdentities.map(({ description, identity, label }) => (
							<div className="min-w-0 bg-card p-4" key={label}>
								<div className="mb-2">
									<h3 className="text-sm font-medium text-foreground">{label}</h3>
									<p className="text-xs text-muted-foreground">{description}</p>
								</div>
								<ExecutionIdentityBadges {...identity} />
							</div>
						))}
					</div>
				</section>
			</Card>

			<Card aria-labelledby="badge-lab-constrained" className="overflow-hidden p-0">
				<section>
					<CardHeader
						className="mb-0 border-b border-border px-4 py-3"
						description="The compact variant at the column budgets it actually has to survive. A specimen page that only shows the component at its natural width cannot fail."
						id="badge-lab-constrained"
						title="Constrained widths"
					/>
					<div className="grid gap-px bg-border sm:grid-cols-2">
						{representativeIdentities.slice(0, 2).map(({ identity, label }) => (
							<div className="bg-card p-4" key={label}>
								<ConstrainedSpecimens identity={identity} label={label} />
							</div>
						))}
					</div>
				</section>
			</Card>

			{/* `items-start`: without it the three catalog cards stretch to the tallest and the two
			    shorter ones end in 90-140px of empty card. */}
			<div className="grid items-start gap-4 xl:grid-cols-3">
				<CatalogGroup
					description="Every built-in execution backend."
					id="badge-lab-cli-catalog"
					title="CLIs">
					{cliCatalog.map((cli) => {
						const label = cliDisplayLabel(cli);
						return (
							<span className="inline-flex items-center gap-1.5" key={cli}>
								<ExecutionIdentityBadges backend={cli} withTooltip={false} />
								{label !== null && (
									<span className="text-xs text-muted-foreground">{label}</span>
								)}
							</span>
						);
					})}
				</CatalogGroup>

				<CatalogGroup
					description="Every built-in model identifier."
					id="badge-lab-model-catalog"
					title="Models">
					{executionIdentityModelCatalog.map((model) => (
						<ExecutionIdentityBadges key={model} model={model} withTooltip={false} />
					))}
				</CatalogGroup>

				<CatalogGroup
					description="Every supported reasoning-effort value."
					id="badge-lab-reasoning-catalog"
					title="Reasoning">
					{executionIdentityReasoningCatalog.map((reasoningEffort) => (
						<ExecutionIdentityBadges
							key={reasoningEffort}
							reasoningEffort={reasoningEffort}
							withTooltip={false}
						/>
					))}
				</CatalogGroup>
			</div>
		</div>
	);
}

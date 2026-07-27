import type { ReactNode } from 'react';

import { FRONTEND_ROUTE_PATHS } from 'aidd-shared/contracts/frontend-routes';
import { Link } from 'react-router';

import {
	type ExecutionIdentity,
	ExecutionIdentityBadges,
} from '../../components/shared/ExecutionIdentityBadges.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { backendLabel, backendOptions } from '../../lib/backends.ts';
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
		<section aria-labelledby={id} className="rounded-lg border border-border bg-card p-4">
			<div className="mb-3">
				<h2 className="font-semibold text-foreground" id={id}>
					{title}
				</h2>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			<div className="flex flex-wrap items-center gap-2">{children}</div>
		</section>
	);
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

			<section
				aria-labelledby="badge-lab-representative"
				className="overflow-hidden rounded-lg border border-border bg-card">
				<header className="border-b border-border px-4 py-3">
					<h2 className="font-semibold text-foreground" id="badge-lab-representative">
						Representative identities
					</h2>
					<p className="text-xs text-muted-foreground">
						Composed examples exercise production, provider, custom, and partial data.
					</p>
				</header>
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

			<div className="grid gap-4 xl:grid-cols-3">
				<CatalogGroup
					description="Every built-in execution backend."
					id="badge-lab-cli-catalog"
					title="CLIs">
					{cliCatalog.map((cli) => (
						<div className="space-y-1" key={cli}>
							<span className="block text-xs text-muted-foreground">
								{cli === 'direct' ? 'Direct AI' : backendLabel(cli)}
							</span>
							<ExecutionIdentityBadges backend={cli} withTooltip={false} />
						</div>
					))}
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

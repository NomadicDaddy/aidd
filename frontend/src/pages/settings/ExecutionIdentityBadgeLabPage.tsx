import { FRONTEND_ROUTE_PATHS } from 'aidd-shared/contracts/frontend-routes';
import { Link } from 'react-router-dom';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { backendLabel, backendOptions } from '../../lib/backends.ts';
import {
	executionIdentityModelCatalog,
	executionIdentityReasoningCatalog,
} from '../../lib/executionIdentity.ts';

const cliCatalog = [...backendOptions.map(({ value }) => value), 'direct'] as const;
const combinationCount =
	cliCatalog.length *
	executionIdentityModelCatalog.length *
	executionIdentityReasoningCatalog.length;

function cliLabel(cli: string): string {
	return cli === 'direct' ? 'Direct AI' : backendLabel(cli);
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
				description={`${combinationCount} combinations · ${cliCatalog.length} CLIs · ${executionIdentityModelCatalog.length} models · ${executionIdentityReasoningCatalog.length} reasoning levels`}
				title="Execution Identity Badge Lab"
			/>

			<Card className="text-sm text-muted-foreground" variant="sunken">
				Every built-in identity color is shown below. User-defined model names use the same
				deterministic fallback color used by the production badge.
			</Card>

			<div className="space-y-4">
				{cliCatalog.map((cli) => (
					<section
						aria-labelledby={`badge-lab-${cli}`}
						className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
						key={cli}>
						<header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
							<h2 className="font-semibold text-foreground" id={`badge-lab-${cli}`}>
								{cliLabel(cli)}
							</h2>
							<ExecutionIdentityBadges backend={cli} withTooltip={false} />
						</header>

						<div className="divide-y divide-border">
							{executionIdentityModelCatalog.map((model) => (
								<div
									className="grid gap-3 px-4 py-3 xl:grid-cols-[13rem_minmax(0,1fr)] xl:items-center"
									key={model}>
									<code
										className="truncate text-xs text-muted-foreground"
										title={model}>
										{model}
									</code>
									<div className="flex flex-wrap items-center gap-2">
										{executionIdentityReasoningCatalog.map(
											(reasoningEffort) => (
												<ExecutionIdentityBadges
													backend={cli}
													key={reasoningEffort}
													model={model}
													reasoningEffort={reasoningEffort}
													withTooltip={false}
												/>
											),
										)}
									</div>
								</div>
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}

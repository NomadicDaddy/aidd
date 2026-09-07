import type { ReactNode } from 'react';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { backendLabel } from '../../lib/backends.ts';
import {
	executionIdentityCliCatalog,
	executionIdentityModelCatalog,
	executionIdentityReasoningCatalog,
} from '../../lib/executionIdentity.ts';

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
		<Card>
			<section aria-labelledby={id}>
				<CardHeader className="mb-3" description={description} id={id} title={title} />
				<div className="flex flex-wrap items-center gap-x-2 gap-y-5">{children}</div>
			</section>
		</Card>
	);
}

/**
 * The display name of a CLI, where it differs from the value the chip already shows.
 *
 * Not loose text beside the chip: that would have three of eleven entries carry a word in the wrap
 * flow and eight carry nothing — a ragged row in which the three exceptions read as leftover
 * debris rather than as a distinction. The chip is the specimen this page exists to show; the
 * display name is a gloss on it.
 *
 * Not a native `title` either, for the reason the badge component's own source comment gives:
 * mouse-only, so unreachable by keyboard and by touch, and a second reveal mechanism on a sheet
 * that already ships `ui/tooltip`. It goes through the `hint` prop and lands in the same details
 * panel every other specimen uses.
 */
function cliDisplayTitle(cli: string): string | undefined {
	const label = cli === 'direct' ? 'Direct AI' : backendLabel(cli);
	return label.toLowerCase() === cli.toLowerCase() ? undefined : label;
}

/** The three exhaustive catalogs: every CLI, every model, every reasoning-effort value. */
export function ExecutionIdentityCatalogSections() {
	return (
		// `items-start`: without it the three catalog cards stretch to the tallest and the two
		// shorter ones end in 90-140px of empty card.
		//
		// Container steps, not `xl:grid-cols-3`. The two cards above split on their own width while
		// this row read the viewport, so at 1024x768 the section was 736px wide — room for two
		// columns — and `xl` gave it one, stacking three cards of 54-182px chips into a single
		// 736px column and pushing the page to 1258px of scroll.
		<div className="@container">
			<div className="grid items-start gap-4 @min-[32rem]:grid-cols-2 @min-[61rem]:grid-cols-3">
				<CatalogGroup
					description="Every built-in CLI."
					id="badge-lab-cli-catalog"
					title="CLIs">
					{executionIdentityCliCatalog.map((cli) => (
						<ExecutionIdentityBadges
							backend={cli}
							hint={cliDisplayTitle(cli)}
							key={cli}
						/>
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

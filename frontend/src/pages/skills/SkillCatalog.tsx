import { default as Gauge } from 'lucide-react/dist/esm/icons/gauge';
import { default as ListTree } from 'lucide-react/dist/esm/icons/list-tree';

import type { ResourceUsageRow } from '../../api/types.ts';
import type { SkillDefinition } from '../../api/types/skills.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { MATURITY_SKILL_IDS, RECIPE_SKILL_IDS } from '../../lib/catalogCuration.ts';
import { formatUsageBadge } from '../../lib/usageBadge.ts';

function skillSummary(skill: SkillDefinition): string {
	return skill.description || skill.usage || skill.title;
}

/**
 * The scrolling skill list.
 *
 * The card is a viewport-height scrollport rather than a fixed `max-h-[34rem]` block: capped at
 * 34rem it stopped roughly 350px above its own bottom edge, so the operator scrolled a short inner
 * window inside a long outer page while a third of the card sat empty. Sticky keeps the list beside
 * the details column while that column scrolls.
 */
export function SkillCatalog({
	loading,
	onSelect,
	selectedId,
	skills,
	total,
	usageByResourceId,
}: {
	loading: boolean;
	onSelect: (id: string) => void;
	selectedId: null | string;
	skills: SkillDefinition[];
	total: number;
	usageByResourceId: Map<string, ResourceUsageRow>;
}) {
	return (
		<Card className="flex max-h-[calc(100vh-9rem)] min-w-0 flex-col gap-2 lg:sticky lg:top-4">
			<div className="text-xs text-muted-foreground tabular-nums">
				{skills.length === total
					? `${total} skills`
					: `${skills.length} of ${total} skills`}
			</div>
			<div className="min-h-0 flex-1 space-y-1 overflow-auto pr-1">
				{loading && total === 0 ? (
					<div className="space-y-2 p-1">
						{Array.from({ length: 6 }).map((_, index) => (
							<div
								className="space-y-2 rounded-md border border-border px-3 py-2"
								key={index}>
								<SkeletonLines count={2} label="Loading skills…" />
							</div>
						))}
					</div>
				) : null}
				{skills.map((skill) => (
					<SkillCatalogRow
						key={skill.id}
						onSelect={onSelect}
						selected={skill.id === selectedId}
						skill={skill}
						usage={usageByResourceId.get(skill.id)}
					/>
				))}
				{!loading && skills.length === 0 ? (
					<EmptyState>
						{total === 0 ? 'No skills available.' : 'No skills match these filters.'}
					</EmptyState>
				) : null}
			</div>
		</Card>
	);
}

function SkillCatalogRow({
	onSelect,
	selected,
	skill,
	usage,
}: {
	onSelect: (id: string) => void;
	selected: boolean;
	skill: SkillDefinition;
	usage: ResourceUsageRow | undefined;
}) {
	const usageLine = formatUsageBadge(usage);
	// Taxonomy, not status: `Recipe` and `Maturity` say what kind of skill this is, so they read as
	// meta text beside the usage count instead of spending a coloured pill each. `bundled` is on
	// every row in the catalog and distinguishes nothing, so only `imported` still earns a badge.
	const tags = [
		...(RECIPE_SKILL_IDS.has(skill.id) ? ['Recipe'] : []),
		...(MATURITY_SKILL_IDS.has(skill.id) ? ['Maturity'] : []),
		...(usageLine ? [usageLine] : []),
	];
	return (
		<button
			// The teal fill was the only signal that this row was the one being detailed; the
			// SegmentedControl above it has exposed `aria-pressed` all along.
			aria-pressed={selected}
			className={`w-full rounded-md border px-3 py-1.5 text-left transition-colors ${
				selected ? 'border-accent bg-accent-muted' : 'border-border hover:bg-muted'
			}`}
			onClick={() => onSelect(skill.id)}
			type="button">
			<div className="flex min-w-0 items-baseline gap-2">
				{/* The list scans by name and the detail card echoes what was clicked: the row led
				    with the raw mono id and never rendered the title the detail pane shows. */}
				<span className="truncate text-sm font-semibold text-foreground">
					{skill.title}
				</span>
				<span className="truncate font-mono text-2xs text-muted-foreground">
					{skill.id}
				</span>
				{skill.origin === 'imported' ? <Badge tone="amber">imported</Badge> : null}
			</div>
			<p className="line-clamp-1 text-xs text-muted-foreground">{skillSummary(skill)}</p>
			{tags.length > 0 ? (
				<p className="flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
					{RECIPE_SKILL_IDS.has(skill.id) ? (
						<ListTree aria-hidden="true" className="h-3 w-3" />
					) : null}
					{MATURITY_SKILL_IDS.has(skill.id) ? (
						<Gauge aria-hidden="true" className="h-3 w-3" />
					) : null}
					{tags.join(' · ')}
				</p>
			) : null}
		</button>
	);
}

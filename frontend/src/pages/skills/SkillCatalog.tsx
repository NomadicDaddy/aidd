import type { ResourceUsageRow } from '../../api/types.ts';
import type { SkillDefinition } from '../../api/types/skills.ts';
import type { FilterRegister } from '../../lib/filterFields.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { ListBox } from '../../components/ui/listbox.tsx';
import { MATURITY_SKILL_IDS, RECIPE_SKILL_IDS } from '../../lib/catalogCuration.ts';
import { cn } from '../../lib/cn.ts';
import { formatUsageBadge } from '../../lib/usageBadge.ts';

function skillSummary(skill: SkillDefinition): string {
	return skill.description || skill.usage || skill.title;
}

/**
 * The scrolling skill list.
 *
 * The card is capped by the measured split region rather than a viewport guess. A long catalog
 * scrolls within that cap, while a short or empty result set stops after its content instead of
 * stretching a mostly empty border to the bottom of the region.
 */
export function SkillCatalog({
	activeId,
	className,
	filters,
	loading,
	onSelect,
	selectedId,
	skills,
	total,
	usageByResourceId,
}: {
	activeId: null | string;
	className?: string | undefined;
	/** The filters that narrowed the catalog to nothing, when any are in force. */
	filters: FilterRegister | undefined;
	loading: boolean;
	onSelect: (id: string) => void;
	selectedId: null | string;
	skills: SkillDefinition[];
	total: number;
	usageByResourceId: Map<string, ResourceUsageRow>;
}) {
	return (
		// `className` carries the show/hide half of the narrow master-detail switch. It arrives on
		// the Card rather than on a wrapper so the grid can cap the scrolling surface directly.
		<Card className={cn('flex min-w-0 flex-col gap-2 @min-[40rem]:max-h-full', className)}>
			<div className="min-h-0 flex-1 overflow-auto pr-1">
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
				{skills.length > 0 ? (
					<ListBox
						activeId={activeId}
						ariaLabel="Skills"
						className="space-y-1"
						idPrefix="skill"
						onSelect={onSelect}
						// The row body separates the rows, not a 1.23:1 outline. `border-border`
						// (#252b38) on `--card` (#161a22) is barely a line, and 76 rows of three
						// tightly stacked lines behind it read as one continuous field of text
						// rather than as a list. Filling each row makes it a tile against the card,
						// and the border stays in the class list at `transparent` so the selected
						// state's accent outline does not change the row's height by a pixel. The
						// active-but-unselected row is the narrow layout's return anchor: it keeps
						// the accent border without claiming that hidden detail remains selected.
						optionClassName={(selected) =>
							`block w-full rounded-md border px-3 py-1.5 text-left transition-colors ${
								selected
									? 'border-accent bg-accent-muted'
									: 'border-transparent bg-muted/60 hover:bg-muted data-[active=true]:border-accent'
							}`
						}
						options={skills.map((skill) => ({
							content: (
								<SkillCatalogRow
									skill={skill}
									usage={usageByResourceId.get(skill.id)}
								/>
							),
							id: skill.id,
							label: skill.title,
						}))}
						selectedId={selectedId}
					/>
				) : null}
				{!loading && skills.length === 0 ? (
					<EmptyState filterReset="toolbar" filters={filters}>
						{total === 0 ? 'No skills available.' : 'No skills match these filters.'}
					</EmptyState>
				) : null}
			</div>
		</Card>
	);
}

function SkillCatalogRow({
	skill,
	usage,
}: {
	skill: SkillDefinition;
	usage: ResourceUsageRow | undefined;
}) {
	const usageLine = formatUsageBadge(usage);
	// Taxonomy, not status: `Recipe` and `Maturity` say what kind of skill this is, so they read as
	// meta text beside the usage count instead of spending a coloured pill each. `bundled` is on
	// every row in the catalog and distinguishes nothing, so only `imported` still earns a badge.
	// The words carry it alone — the icons that preceded them printed a glyph and then the word it
	// stands for, twice per row.
	const tags = [
		...(RECIPE_SKILL_IDS.has(skill.id) ? ['Recipe'] : []),
		...(MATURITY_SKILL_IDS.has(skill.id) ? ['Maturity'] : []),
		...(usageLine ? [usageLine] : []),
	];
	return (
		<>
			{/* The title takes the line. Sharing it with the mono id truncated both — 'Promote
			    Remediation to Fe…' beside 'promote-remediat…' identified neither — so the id moved
			    down to the meta line, which already wraps. */}
			<div className="flex min-w-0 items-baseline gap-2">
				<span className="truncate text-sm font-semibold text-foreground">
					{skill.title}
				</span>
				{skill.origin === 'imported' ? (
					<span className="shrink-0">
						<Badge casing="title" tone="neutral">
							imported
						</Badge>
					</span>
				) : null}
			</div>
			<p className="line-clamp-1 text-xs text-muted-foreground">{skillSummary(skill)}</p>
			<p className="flex min-w-0 flex-wrap items-center gap-x-2 text-2xs text-muted-foreground sm:flex-nowrap">
				<span className="min-w-0 font-mono break-words max-sm:basis-full sm:truncate">
					{skill.id}
				</span>
				{tags.length > 0 ? <span className="shrink-0">{tags.join(' · ')}</span> : null}
			</p>
		</>
	);
}

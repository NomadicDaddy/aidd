import type { ResourceUsageRow } from '../../api/types.ts';
import type { SkillDefinition } from '../../api/types/skills.ts';

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
 * The card fills the split region rather than capping itself: at `max-h-[calc(100vh-9rem)]` its
 * bottom edge landed 44px below the fold and its last row was clipped, because 9rem was a guess at
 * chrome that is actually 188px and changes when the filter strip wraps. `h-[--fill-height]` comes
 * from the region's own measurement, so the last row is above the fold at rest by construction.
 */
export function SkillCatalog({
	className,
	loading,
	onSelect,
	selectedId,
	skills,
	total,
	usageByResourceId,
}: {
	className?: string | undefined;
	loading: boolean;
	onSelect: (id: string) => void;
	selectedId: null | string;
	skills: SkillDefinition[];
	total: number;
	usageByResourceId: Map<string, ResourceUsageRow>;
}) {
	return (
		// `className` carries the show/hide half of the narrow master-detail switch. It arrives on
		// the Card rather than on a wrapper because the height chain runs through this element —
		// a div between the grid and the Card would break `h-full` for the sake of two classes.
		<Card className={cn('flex min-w-0 flex-col gap-2 @min-[40rem]:h-full', className)}>
			{/* The wording `FilterToolbar` uses on every other catalog — Projects, Recipes, Runs,
			    Audits, Profile Matrix — rather than this card's own shorter form. It read
			    `76 skills` at rest and `12 of 76 skills` filtered, so the one catalog that keeps
			    its count inside the list instead of in a toolbar was also the one catalog that
			    said it differently, and at rest it did not say what the filter had to work with. */}
			<div className="text-xs text-muted-foreground tabular-nums">
				Showing {skills.length} of {total} skills
			</div>
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
						ariaLabel="Skills"
						className="space-y-1"
						idPrefix="skill"
						onSelect={onSelect}
						// The row body separates the rows, not a 1.23:1 outline. `border-border`
						// (#252b38) on `--card` (#161a22) is barely a line, and 76 rows of three
						// tightly stacked lines behind it read as one continuous field of text
						// rather than as a list. Filling each row makes it a tile against the card,
						// and the border stays in the class list at `transparent` so the selected
						// state's accent outline does not change the row's height by a pixel.
						optionClassName={(selected) =>
							`block w-full rounded-md border px-3 py-1.5 text-left transition-colors ${
								selected
									? 'border-accent bg-accent-muted'
									: 'border-transparent bg-muted/60 hover:bg-muted'
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
					<EmptyState>
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
						<Badge tone="neutral">imported</Badge>
					</span>
				) : null}
			</div>
			<p className="line-clamp-1 text-xs text-muted-foreground">{skillSummary(skill)}</p>
			<p className="flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
				<span className="font-mono break-all">{skill.id}</span>
				{tags.length > 0 ? <span>{tags.join(' · ')}</span> : null}
			</p>
		</>
	);
}

import type { SkillDefinition } from '../../api/types/skills.ts';
import type { SkillCategoryFilter } from '../../lib/catalogCuration.ts';

import { FilterSearch } from '../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../components/shared/FilterToolbar.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { SKILL_CATEGORY_FILTERS } from '../../lib/catalogCuration.ts';
import { cn } from '../../lib/cn.ts';
import { countActiveFilters } from '../../lib/filterFields.ts';

export function SkillsFilterToolbar({
	category,
	className,
	filtered,
	onReset,
	query,
	setCategory,
	setQuery,
	skills,
}: {
	category: SkillCategoryFilter;
	className?: string | undefined;
	filtered: number;
	onReset: () => void;
	query: string;
	setCategory: (category: SkillCategoryFilter) => void;
	setQuery: (query: string) => void;
	skills: SkillDefinition[];
}) {
	const categoryCounts = new Map<SkillCategoryFilter, number>([['all', skills.length]]);
	for (const skill of skills) {
		categoryCounts.set(skill.category, (categoryCounts.get(skill.category) ?? 0) + 1);
	}
	const options = SKILL_CATEGORY_FILTERS.map((option) => ({
		...option,
		count: categoryCounts.get(option.value) ?? 0,
	}));

	return (
		<div
			className={cn(
				'sticky top-[var(--app-topbar-height,0px)] z-10 bg-background py-1 sm:static sm:bg-transparent sm:py-0',
				className,
			)}>
			<FilterToolbar
				activeFilterCount={countActiveFilters(category !== 'all')}
				columns="@min-[62rem]:grid-cols-[minmax(0,20rem)_1fr]"
				filtered={filtered}
				hasFilters={query.trim().length > 0 || category !== 'all'}
				noun="skills"
				onReset={onReset}
				primaryControlCount={1}
				total={skills.length}>
				<FilterSearch
					ariaLabel="Search skills"
					onChange={setQuery}
					placeholder="Filter skills"
					shortcut
					value={query}
				/>
				<FieldRow group label="Category">
					<SegmentedControl
						ariaLabel="Filter skills by category"
						onChange={setCategory}
						options={options}
						value={category}
					/>
				</FieldRow>
			</FilterToolbar>
		</div>
	);
}

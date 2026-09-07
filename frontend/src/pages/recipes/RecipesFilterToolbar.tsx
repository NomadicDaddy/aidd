import type { RecipeLaunchProject } from './recipe-launch.ts';

import { FilterSearch } from '../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../components/shared/FilterToolbar.tsx';
import { toneText } from '../../lib/tones.ts';
import { launchHint } from './recipe-launch.ts';
import { RecipeProjectField } from './RecipeProjectField.tsx';

export function RecipesFilterToolbar({
	filtered,
	launchHintId,
	onProjectChange,
	onReset,
	onSearchChange,
	projectDir,
	projects,
	search,
	total,
}: {
	filtered: number;
	launchHintId: string;
	onProjectChange: (projectDir: string) => void;
	onReset: () => void;
	onSearchChange: (search: string) => void;
	projectDir: string;
	projects: RecipeLaunchProject[];
	search: string;
	total: number;
}) {
	return (
		<FilterToolbar
			columns="@min-[36rem]:grid-cols-[minmax(0,20rem)]"
			filtered={filtered}
			hasFilters={search.trim().length > 0}
			header={
				<div className="w-full border-b border-border pb-3">
					<div className="max-w-md">
						<RecipeProjectField
							describedBy={launchHintId}
							label="Launch target project"
							onChange={onProjectChange}
							projectDir={projectDir}
							projects={projects}
						/>
						<p
							className={`mt-1 text-xs ${projectDir ? 'text-muted-foreground' : toneText.amber}`}
							id={launchHintId}>
							{projectDir
								? 'Launch actions use this project as their target.'
								: `${launchHint}. Details opens without one.`}
						</p>
					</div>
				</div>
			}
			noun="recipes"
			onReset={onReset}
			primaryControlCount={1}
			total={total}>
			<FilterSearch
				ariaLabel="Search recipes"
				onChange={onSearchChange}
				placeholder="Filter recipes"
				shortcut
				value={search}
			/>
		</FilterToolbar>
	);
}

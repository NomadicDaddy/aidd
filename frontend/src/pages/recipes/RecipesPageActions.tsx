import { default as List } from 'lucide-react/dist/esm/icons/list';
import { default as PanelsTopLeft } from 'lucide-react/dist/esm/icons/panels-top-left';
import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

import { Button } from '../../components/ui/button.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';

/**
 * The recipes page header actions.
 *
 * Its own file for the same reason `ProjectsPageActions` is: `RecipesPage` sat two lines under the
 * 300-line cap, so the header could not be explained where it lives without pushing the page over.
 */
export function RecipesPageActions({
	onNew,
	onReload,
	recipesView,
	reloading,
	setRecipesView,
}: {
	onNew: () => void;
	onReload: () => void;
	recipesView: 'cards' | 'table';
	reloading: boolean;
	setRecipesView: (view: 'cards' | 'table') => void;
}) {
	return (
		// `flex-nowrap` plus icon-only labels below `md`: at 768 the labels wrapped mid-button and
		// pushed the view toggle onto a second row.
		<div className="flex flex-nowrap items-center gap-2">
			<Button aria-label="New Recipe" onClick={onNew} size="toolbar" variant="primary">
				<Plus className="h-4 w-4" />
				<span className="hidden lg:inline">New Recipe</span>
			</Button>
			<Button
				aria-label="Reload recipes"
				disabled={reloading}
				onClick={onReload}
				size="toolbar">
				<RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
				<span className="hidden lg:inline">{reloading ? 'Reloading…' : 'Reload'}</span>
			</Button>
			{/* `w-auto`, because `SegmentedControl` is `w-full` below `sm` and this row is
			    `flex-nowrap`. A `w-full` child placed after two 42px siblings resolves to 100% of the
			    container measured from x=116, so it claimed 358px starting at 116 and put the
			    document at 474px against a 390px viewport — the arithmetic three sweeps measured and
			    twice attributed to the sidebar. `ProjectsPageActions` renders this same header shape
			    and already says `w-auto`; this one said `shrink-0`, which pins the wrong axis: it
			    stops the control shrinking but says nothing about what `w-full` resolves against.
			    `shrink-0` stays alongside it, because at 1024 the buttons take their labels and leave
			    the control 0.6px short of its two segments — and the track is `sm:flex-wrap`, so
			    without it the segments wrap and the header grows from 42px to 78px tall. */}
			<SegmentedControl
				ariaLabel="Recipe view"
				className="w-auto shrink-0"
				onChange={setRecipesView}
				options={[
					{
						ariaLabel: 'Card view',
						label: <PanelsTopLeft aria-hidden="true" className="h-4 w-4" />,
						title: 'Card view',
						value: 'cards',
					},
					{
						ariaLabel: 'Table view',
						label: <List aria-hidden="true" className="h-4 w-4" />,
						title: 'Table view',
						value: 'table',
					},
				]}
				value={recipesView}
			/>
		</div>
	);
}

import { default as Grid2X2 } from 'lucide-react/dist/esm/icons/grid-2-x-2';
import { default as List } from 'lucide-react/dist/esm/icons/list';
import { default as PackagePlus } from 'lucide-react/dist/esm/icons/package-plus';
import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as Table2 } from 'lucide-react/dist/esm/icons/table-2';
import { Link } from 'react-router';

import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';

export function ProjectsPageActions({
	importOpen,
	newOpen,
	onToggleImport,
	onToggleNew,
	projectView,
	setProjectView,
}: {
	importOpen: boolean;
	newOpen: boolean;
	onToggleImport: () => void;
	onToggleNew: () => void;
	projectView: 'cards' | 'table';
	setProjectView: (view: 'cards' | 'table') => void;
}) {
	return (
		// `flex-nowrap`: at 768 this row wrapped onto three lines and squeezed the PageHeader title
		// column to ~110px. The two secondary actions drop their labels below `lg` so the row holds.
		<div className="flex flex-nowrap items-center gap-2">
			{/* The page's one primary, and primary at rest — it used to go teal only once the intake
			    panel was already open, so the resting header had no primary at all while the card
			    grid below it carried one teal Start per project. `aria-pressed` carries the open
			    state, which is what it was using tone to say. */}
			<Button
				aria-label="New project"
				aria-pressed={newOpen}
				onClick={onToggleNew}
				variant="primary">
				<Plus className="h-4 w-4" />
				<span className="hidden sm:inline">New Project</span>
			</Button>
			{/* A shortcut into the intake panel's Ingest lane, not a peer of the primary entry
			    point: as a second `primary` it lit teal at the same time as the panel's own
			    "Ingest Existing" tab, two controls rendering one state. `secondary` rather than
			    `ghost` says the same thing — it is not the teal — while keeping the run of four
			    at one weight. As the only borderless label between two bordered ones, `ghost`
			    read as a gap punched through the group rather than as a lower priority. */}
			<Button
				aria-label="Import existing projects"
				aria-pressed={importOpen}
				onClick={onToggleImport}
				variant="secondary">
				<PackagePlus className="h-4 w-4" />
				<span className="hidden lg:inline">Import Existing</span>
			</Button>
			<Link
				aria-label="Open profile matrix"
				// Icon-only below `lg`, so `px-3` around a 16px glyph left it 42px wide against a
				// 44px height. `min-w-11` rather than a width, so the label still sizes it at `lg`.
				className={buttonClassName('secondary', 'max-sm:min-w-11')}
				to="/projects/profile-matrix">
				{/* Not `list`. That glyph is half of the SegmentedControl's grid/list pair sitting
				    ~40px to the right, so the row offered the same mark twice — once to change the
				    view, once to change the route — and diluted the one pairing the toggle depends
				    on. `table-2` is what the profile-matrix route actually renders. */}
				<Table2 className="h-4 w-4" />
				<span className="hidden lg:inline">Profile Matrix</span>
			</Link>
			<SegmentedControl
				ariaLabel="Project view"
				className="w-auto"
				onChange={setProjectView}
				options={[
					{
						ariaLabel: 'Card view',
						label: <Grid2X2 className="h-4 w-4" />,
						title: 'Card view',
						value: 'cards',
					},
					{
						ariaLabel: 'Table view',
						label: <List className="h-4 w-4" />,
						title: 'Table view',
						value: 'table',
					},
				]}
				value={projectView}
			/>
		</div>
	);
}

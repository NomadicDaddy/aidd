import { default as Grid2X2 } from 'lucide-react/dist/esm/icons/grid-2-x-2';
import { default as List } from 'lucide-react/dist/esm/icons/list';
import { default as PackagePlus } from 'lucide-react/dist/esm/icons/package-plus';
import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
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
			    "Ingest Existing" tab, two controls rendering one state. */}
			<Button
				aria-label="Import existing projects"
				aria-pressed={importOpen}
				onClick={onToggleImport}
				variant="ghost">
				<PackagePlus className="h-4 w-4" />
				<span className="hidden lg:inline">Import Existing</span>
			</Button>
			<Link
				aria-label="Open profile matrix"
				className={buttonClassName('secondary')}
				to="/projects/profile-matrix">
				<List className="h-4 w-4" />
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

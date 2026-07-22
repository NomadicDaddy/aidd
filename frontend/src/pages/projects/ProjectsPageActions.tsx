import { default as Grid2X2 } from 'lucide-react/dist/esm/icons/grid-2-x-2';
import { default as List } from 'lucide-react/dist/esm/icons/list';
import { default as PackagePlus } from 'lucide-react/dist/esm/icons/package-plus';
import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { Link } from 'react-router-dom';

import { Button, buttonClassName } from '../../components/ui/button.tsx';

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
		<div className="flex flex-wrap items-center gap-2">
			<Button
				aria-label="New project"
				onClick={onToggleNew}
				variant={newOpen ? 'primary' : 'secondary'}>
				<Plus className="h-4 w-4" />
				<span className="hidden sm:inline">New Project</span>
			</Button>
			<Button
				aria-label="Import existing projects"
				onClick={onToggleImport}
				variant={importOpen ? 'primary' : 'secondary'}>
				<PackagePlus className="h-4 w-4" />
				<span className="hidden sm:inline">Import Existing</span>
			</Button>
			<Link
				aria-label="Open profile matrix"
				className={buttonClassName('secondary')}
				to="/projects/profile-matrix">
				<List className="h-4 w-4" />
				<span className="hidden sm:inline">Profile Matrix</span>
			</Link>
			<Button
				aria-label="Card view"
				onClick={() => setProjectView('cards')}
				variant={projectView === 'cards' ? 'primary' : 'secondary'}>
				<Grid2X2 className="h-4 w-4" />
			</Button>
			<Button
				aria-label="Table view"
				onClick={() => setProjectView('table')}
				variant={projectView === 'table' ? 'primary' : 'secondary'}>
				<List className="h-4 w-4" />
			</Button>
		</div>
	);
}

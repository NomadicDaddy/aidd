import type { ProjectDetail } from '../../../api/types.ts';

import { DeleteProjectCard } from './DeleteProjectCard.tsx';
import { MoveProjectCard } from './MoveProjectCard.tsx';
import { ReintakeCard } from './ReintakeCard.tsx';
import { RenameProjectCard } from './RenameProjectCard.tsx';

export function ManagementTab({ project }: { project: ProjectDetail }) {
	return (
		// items-start: stretched to its row's tallest sibling, 'Re-run intake' carried ~180px of
		// empty card below its single button purely to match 'Rename project' beside it.
		<div className="grid items-start gap-4 xl:grid-cols-2">
			<ReintakeCard project={project} />
			<RenameProjectCard project={project} />
			<MoveProjectCard project={project} />
			<DeleteProjectCard project={project} />
		</div>
	);
}

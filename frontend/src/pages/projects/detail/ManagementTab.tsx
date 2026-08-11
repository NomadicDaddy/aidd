import type { ProjectDetail } from '../../../api/types.ts';

import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { DeleteProjectCard } from './DeleteProjectCard.tsx';
import { MoveProjectCard } from './MoveProjectCard.tsx';
import { ReintakeCard } from './ReintakeCard.tsx';
import { RenameProjectCard } from './RenameProjectCard.tsx';

export function ManagementTab({ project }: { project: ProjectDetail }) {
	return (
		<div className="space-y-4">
			<TabIntro
				description="Rename, move, re-run intake on, or delete this project. These actions change the project on disk."
				title="Management"
			/>
			{/* items-start: stretched to its row's tallest sibling, 'Re-run intake' carried ~180px
			    of empty card below its single button purely to match 'Rename project' beside it. */}
			{/* Ordered so the two tall cards share a row. Laid out in file order against
			    `items-start`, the 130px Re-run intake card left 142px of dead space beside the
			    272px Rename and Delete left 74px beside Move, and the tab finished around y=890 in
			    a 1309px viewport. */}
			<div className="grid items-start gap-4 xl:grid-cols-2">
				<RenameProjectCard project={project} />
				<MoveProjectCard project={project} />
				<ReintakeCard project={project} />
				<DeleteProjectCard project={project} />
			</div>
		</div>
	);
}

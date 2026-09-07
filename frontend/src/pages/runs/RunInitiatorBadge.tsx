import type { RunRecord } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { presentRunRecordInitiator } from './runInitiator.ts';

/**
 * Who caused this run, as a chip on the row.
 *
 * It rides in the KIND cell beside the launch surface rather than taking a column of its own: the
 * two answer adjacent questions — which door the run came in by, and whether anybody opened it —
 * and the table already spends its width on name, project and execution identity.
 *
 * Every run row carries one, including the unrecorded case. A row with no badge would read as a run
 * nobody asked for, which is an answer, and for a pre-provenance row it is one nothing recorded.
 * The full sentence rides in `title`; the detail panel states it without hovering.
 */
export function RunInitiatorBadge({ run }: { run: Pick<RunRecord, 'initiator'> }) {
	const presentation = presentRunRecordInitiator(run);
	return (
		<Badge title={presentation.sentence} tone={presentation.tone}>
			{presentation.label}
		</Badge>
	);
}

import type { PipelineSessionRecord } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';

/**
 * Qualifies a session whose steps all succeeded but whose work did not get done.
 *
 * A coding run that cannot verify live parks its feature and still exits 0, so the step row, the
 * session status and the run outcome are all green. Reviewing such a session, there is nothing on
 * screen that says the features it touched are still waiting on a human — this is that thing. It
 * sits beside the status badge rather than replacing it, because the session really did complete;
 * what it completed is the qualification.
 * @param props.parkedWorkRuns Count of the session's runs that parked their feature.
 */
export function ParkedWorkBadge({ parkedWorkRuns }: Pick<PipelineSessionRecord, 'parkedWorkRuns'>) {
	if (parkedWorkRuns <= 0) return null;
	return (
		<Badge
			title={`${parkedWorkRuns} run(s) in this session parked their feature instead of completing it; the work is waiting on a human.`}
			tone="amber">
			{parkedWorkRuns} parked
		</Badge>
	);
}

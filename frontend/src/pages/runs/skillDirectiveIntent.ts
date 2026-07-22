import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import type { RunCommitsResponse, RunRecord } from '../../api/types.ts';

export function skillDirectiveExecutionIntent(
	run: Pick<RunRecord, 'launchCommand' | 'mode'>
): null | SkillExecutionIntent {
	if (run.mode !== 'directive') return null;
	const args = run.launchCommand?.args ?? [];
	if (!args.includes('--skill')) return null;
	return args.includes('--directive-readonly') ? 'review-only' : 'apply-changes';
}

export function isReadOnlySkillDirectiveViolation(
	run: Pick<RunRecord, 'launchCommand' | 'mode'>,
	evidence: Pick<RunCommitsResponse, 'commitsCreatedCount' | 'filesCreated' | 'filesEdited'>
): boolean {
	return (
		skillDirectiveExecutionIntent(run) === 'review-only' &&
		(evidence.filesCreated > 0 || evidence.filesEdited > 0 || evidence.commitsCreatedCount > 0)
	);
}

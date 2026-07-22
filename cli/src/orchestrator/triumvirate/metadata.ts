import type { SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { mirrorExclusions, type TriumvirateStageName } from './types.ts';

export function buildTriumvirateMetadata(
	plan: RunPlan,
	work: SelectedWork,
	planningProjectDirs: Record<Exclude<TriumvirateStageName, 'execution'>, string>
): Record<string, unknown> {
	return {
		guard: {
			source: 'git status --porcelain=v1 --untracked-files=all',
			target: 'original_project_worktree',
		},
		planningMirror: {
			excludedNames: [...mirrorExclusions].sort(),
			isolation: 'per_role',
			projectDir: planningProjectDirs.primary,
			promptProjectPath: 'rewritten_to_role_planning_mirror',
			roleProjectDirs: planningProjectDirs,
		},
		roles: plan.triumvirate,
		selectedWork: summarizeSelectedWork(work),
	};
}

export function summarizeSelectedWork(work: SelectedWork): Record<string, unknown> {
	return {
		description: work.description,
		id: work.id,
		...(work.kind !== undefined ? { kind: work.kind } : {}),
	};
}

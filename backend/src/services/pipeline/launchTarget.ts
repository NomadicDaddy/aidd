import type { LaunchTargetOverrides } from 'aidd-shared/plan/launch-target';

import { normalizeBackendName } from 'aidd-shared/plan/types';

import type { PipelineSessionRow } from './types.ts';

/**
 * Collapse an all-empty override object to undefined so "no override" has one
 * representation everywhere (context checks, row persistence, step handlers).
 *
 * @param target Raw override object from a route/session, possibly empty.
 * @returns The trimmed override, or undefined when nothing is overridden.
 */
export function normalizeLaunchTarget(
	target: LaunchTargetOverrides | undefined
): LaunchTargetOverrides | undefined {
	if (!target) return undefined;
	const normalized: LaunchTargetOverrides = {};
	if (target.backend !== undefined) normalized.backend = target.backend;
	if (target.model !== undefined && target.model !== '') normalized.model = target.model;
	if (target.reasoningEffort !== undefined && target.reasoningEffort !== '') {
		normalized.reasoningEffort = target.reasoningEffort;
	}
	return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/**
 * Rehydrate the session-level launch override persisted on a pipeline_sessions row
 * (launch_backend/launch_model/launch_reasoning_effort) for the resume path.
 *
 * @param session The persisted session row being resumed.
 * @returns The override to place on the resumed ExecutionContext, or undefined.
 */
export function launchTargetFromSessionRow(
	session: PipelineSessionRow
): LaunchTargetOverrides | undefined {
	return normalizeLaunchTarget({
		backend: normalizeBackendName(session.launchBackend ?? ''),
		model: session.launchModel ?? undefined,
		reasoningEffort: session.launchReasoningEffort ?? undefined,
	});
}

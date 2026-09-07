import { sessionMetricsRelativePath } from './sessionMetricsPath.ts';

/**
 * The substitution map for one step: the session's resolved recipe parameters plus the
 * session-scoped reserved values.
 *
 * Reserved names win over a same-named recipe parameter. A step asking for
 * `{sessionMetricsPath}` must be handed this session's own metrics file; resolving it from
 * caller-supplied input would reintroduce the ambiguity the exact path exists to remove.
 *
 * These are derived from the live context rather than persisted into `parameters_json`,
 * so a resumed session recomputes them instead of replaying a stale blob, and nested
 * recipe-ref frames inherit the parent session's values through `context.sessionId`.
 * @param context The executing step's context.
 * @param context.parameters The session's resolved recipe parameters.
 * @param context.sessionId The pipeline session the step belongs to.
 * @returns Recipe parameters merged under the reserved session values.
 */
export function stepParameters(context: {
	parameters: Record<string, string>;
	sessionId: string;
}): Record<string, string> {
	return {
		...context.parameters,
		pipelineSessionId: context.sessionId,
		sessionMetricsPath: sessionMetricsRelativePath(context.sessionId),
	};
}

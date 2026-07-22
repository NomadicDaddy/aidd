import type { OverseerDecision } from './types.ts';

export function buildDecisionArtifact(
	decision: OverseerDecision,
	rawStructuredResult: Record<string, unknown> | undefined
): Record<string, unknown> {
	return {
		...(decision.status === 'execute' ? { finalActions: decision.finalActions } : {}),
		...(decision.status === 'execute' && decision.consistencyIssues?.length
			? { consistencyIssues: decision.consistencyIssues }
			: {}),
		...(decision.status !== 'execute' ? { reason: decision.reason } : {}),
		...(rawStructuredResult !== undefined ? { rawStructuredResult } : {}),
		source: 'overseer.AIDD_RESULT',
		status: decision.status,
	};
}

export function parseOverseerDecision(
	structuredResult: Record<string, unknown> | undefined
): OverseerDecision {
	if (!structuredResult) return { reason: 'missing AIDD_RESULT decision', status: 'invalid' };
	if (structuredResult.decision === 'abort') {
		const reason =
			typeof structuredResult.reason === 'string' && structuredResult.reason.trim()
				? structuredResult.reason.trim()
				: 'overseer aborted without a reason';
		return { reason, status: 'abort' };
	}
	if (structuredResult.decision !== 'execute') {
		return { reason: 'decision must be execute or abort', status: 'invalid' };
	}
	const finalActions = structuredResult.finalActions;
	if (typeof finalActions !== 'string' || !finalActions.trim()) {
		return { reason: 'execute decision requires non-empty finalActions', status: 'invalid' };
	}
	const rawIssues = structuredResult.consistencyIssues;
	const consistencyIssues = Array.isArray(rawIssues)
		? rawIssues.filter(
				(issue): issue is string => typeof issue === 'string' && issue.trim() !== ''
			)
		: [];
	return {
		finalActions: finalActions.trim(),
		status: 'execute',
		...(consistencyIssues.length > 0 ? { consistencyIssues } : {}),
	};
}

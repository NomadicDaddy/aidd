import type { AgentErrorEvent } from './types.ts';

export type AgentErrorFatality = 'fatal' | 'nonfatal' | 'unspecified';

/**
 * Read normalized fatality while preserving older terminal events that stored `fatal: true` in
 * provider metadata. Opaque provider metadata can strengthen an event to fatal but can never
 * weaken it; only the normalized top-level field may declare a nonfatal advisory.
 */
export function agentErrorFatality(event: AgentErrorEvent): AgentErrorFatality {
	if (event.fatal !== undefined) return event.fatal ? 'fatal' : 'nonfatal';
	if (typeof event.meta !== 'object' || event.meta === null) return 'unspecified';
	const legacyFatal = (event.meta as Record<string, unknown>).fatal;
	return legacyFatal === true ? 'fatal' : 'unspecified';
}

export function isFatalAgentError(event: AgentErrorEvent): boolean {
	return agentErrorFatality(event) !== 'nonfatal';
}

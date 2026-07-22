import type {
	ChatAgentAction,
	DirectorChatMessageRecord,
	DirectorOutput,
	DirectorProfileRecord,
	DirectorReasoningEffort,
} from 'aidd-shared';

import { requireBackendName, type BackendName } from 'aidd-shared/plan/types';

import type { directorChatMessages } from '../../db/schema.ts';
import type { ProjectSummaryDto } from '../../types.ts';
import type { DirectorRecipeSummary, FleetSummary, ProfileRow } from './types.ts';

export const defaultProfileId = 'default';
export const defaultProfileRole = 'Fleet Director';
export const maxChatContextMessages = 20;
export const maxChatMessageLength = 8000;
export const maxProfileTextLength = 8000;

const reasoningEfforts = new Set<DirectorReasoningEffort>([
	'none',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
]);

export function createCycleId(): string {
	return `cycle_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export function createSuggestionId(): string {
	return `suggestion_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

/** How long a user dismissal suppresses identical re-suggestions (project+title match). */
export const SUGGESTION_DEDUP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// Normalized identity for "the same suggestion": project + case/whitespace-insensitive title.
// A "::" join keeps a title containing the project name from colliding across projects.
export function suggestionDedupKey(projectId: null | string, title: string): string {
	return `${projectId ?? ''}::${title.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

export function createChatSessionId(): string {
	return `dir_chat_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export function createChatMessageId(): string {
	return `dir_msg_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export function isArchivedProject(project: ProjectSummaryDto): boolean {
	return project.name.endsWith('.old');
}

export function cleanText(value: null | string | undefined, maxLength: number): string {
	return (value ?? '').trim().slice(0, maxLength);
}

export function cleanOptionalText(
	value: null | string | undefined,
	maxLength: number
): null | string {
	const cleaned = cleanText(value, maxLength);
	return cleaned ? cleaned : null;
}

export function mapProfile(profile: ProfileRow): DirectorProfileRecord {
	return {
		backend: profile.backend,
		createdAt: profile.createdAt,
		id: profile.id,
		instructions: profile.instructions,
		model: profile.model,
		reasoningEffort: normalizeReasoningEffort(profile.reasoningEffort),
		role: profile.role,
		updatedAt: profile.updatedAt,
	};
}

export function parseChatActions(raw: null | string): ChatAgentAction[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as ChatAgentAction[]) : [];
	} catch {
		return [];
	}
}

export function serializeChatActions(actions: ChatAgentAction[] | undefined): null | string {
	return actions && actions.length > 0 ? JSON.stringify(actions) : null;
}

export function mapChatMessage(
	message: typeof directorChatMessages.$inferSelect
): DirectorChatMessageRecord {
	const role = message.role;
	if (role !== 'assistant' && role !== 'system' && role !== 'user') {
		throw new Error(`Invalid Director chat role: ${role}`);
	}
	return {
		actions: parseChatActions(message.actions),
		content: message.content,
		createdAt: message.createdAt,
		cycleId: message.cycleId,
		id: message.id,
		role,
		sessionId: message.sessionId,
	};
}

export function normalizeBackend(value: string): BackendName {
	return requireBackendName(value);
}

export function normalizeReasoningEffort(value: string): DirectorReasoningEffort {
	if (reasoningEfforts.has(value as DirectorReasoningEffort)) {
		return value as DirectorReasoningEffort;
	}
	throw new Error(`Invalid Director reasoning effort: ${value}`);
}

export function titleFromContent(content: string): string {
	const firstLine = content.split(/\r?\n/)[0] ?? content;
	return firstLine.trim().slice(0, 60) || 'Director Chat';
}

export function isDirectorOutput(value: unknown): value is DirectorOutput {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return Array.isArray(record.suggestions) && typeof record.fleetSummary === 'object';
}

export function buildChatPrompt(
	profile: ProfileRow,
	fleetSummary: FleetSummary,
	messages: DirectorChatMessageRecord[],
	recipeCatalog: DirectorRecipeSummary[] = []
): string {
	const transcript = messages
		.map((message) => `${message.role.toUpperCase()}: ${message.content}`)
		.join('\n\n');
	return [
		'You are the aidd Director in live chat mode.',
		'Answer the user conversationally so they can tailor director behavior, priorities, model choice, role, and future cycles.',
		'This is a read-only chat turn. Do not modify files, launch runs, write suggestions, or emit AIDD_RESULT.',
		'When the user asks for project action, explain what the next Director cycle should prioritize rather than starting work.',
		'Never infer recipe behavior from its name. Use the recipe catalog description and distinguish validation recipes from recipes that edit project artifacts.',
		'',
		'## Active Director Profile',
		`Role: ${profile.role}`,
		`Backend: ${profile.backend}`,
		`Model: ${profile.model ?? 'default'}`,
		`Reasoning effort: ${profile.reasoningEffort}`,
		`Behavior instructions: ${profile.instructions || 'No extra instructions.'}`,
		'',
		'## Current Fleet Summary',
		JSON.stringify(fleetSummary, null, 2),
		'',
		'## Recipe Catalog',
		JSON.stringify(recipeCatalog, null, 2),
		'',
		'## Recent Conversation',
		transcript || 'No prior messages.',
		'',
		'Respond with only the assistant message for this chat turn.',
	].join('\n');
}

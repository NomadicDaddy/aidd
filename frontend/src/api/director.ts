import type {
	DirectorChatMessage,
	DirectorChatMessageInput,
	DirectorChatSession,
	DirectorCycle,
	DirectorCycleInput,
	DirectorProfile,
	DirectorProfileInput,
	FleetSummary,
	OperatorLaunchOutcome,
	SuggestionRecord,
} from './types.ts';

import { apiGet, apiSend } from './client.ts';

export async function createChatSession(title?: string): Promise<DirectorChatSession> {
	const response = await apiSend<{ session: DirectorChatSession }>(
		'/api/v1/director/chat/sessions',
		'POST',
		{ title },
	);
	return response.session;
}

export async function deleteChatSession(id: string): Promise<void> {
	await apiSend<{ ok: true }>(`/api/v1/director/chat/sessions/${id}`, 'DELETE');
}

export async function dismissSuggestion(id: string): Promise<void> {
	await apiSend<{ ok: true }>(`/api/v1/director/suggestions/${id}/dismiss`, 'POST');
}
export async function launchSuggestion(id: string): Promise<OperatorLaunchOutcome> {
	return await apiSend<OperatorLaunchOutcome>(
		`/api/v1/director/suggestions/${id}/launch`,
		'POST',
	);
}

export async function getFleetSummary(signal?: AbortSignal): Promise<FleetSummary> {
	const response = await apiGet<{ fleet: FleetSummary }>('/api/v1/director/fleet', { signal });
	return response.fleet;
}

export async function getProfile(): Promise<DirectorProfile> {
	const response = await apiGet<{ profile: DirectorProfile }>('/api/v1/director/profile');
	return response.profile;
}

export async function listChatMessages(sessionId: string): Promise<DirectorChatMessage[]> {
	const response = await apiGet<{ messages: DirectorChatMessage[] }>(
		`/api/v1/director/chat/sessions/${sessionId}/messages`,
	);
	return response.messages;
}

export async function listChatSessions(): Promise<DirectorChatSession[]> {
	const response = await apiGet<{ sessions: DirectorChatSession[] }>(
		'/api/v1/director/chat/sessions',
	);
	return response.sessions;
}

export async function listDirectorCycles(): Promise<DirectorCycle[]> {
	const response = await apiGet<{ cycles: DirectorCycle[] }>('/api/v1/director/cycles');
	return response.cycles;
}

export async function listSuggestions(): Promise<SuggestionRecord[]> {
	const response = await apiGet<{ suggestions: SuggestionRecord[] }>(
		'/api/v1/director/suggestions',
	);
	return response.suggestions;
}

export async function sendChatMessage(
	sessionId: string,
	content: DirectorChatMessageInput['content'],
): Promise<{ assistant: DirectorChatMessage; user: DirectorChatMessage }> {
	const response = await apiSend<{
		messages: { assistant: DirectorChatMessage; user: DirectorChatMessage };
	}>(`/api/v1/director/chat/sessions/${sessionId}/messages`, 'POST', { content });
	return response.messages;
}

export async function triggerDirectorCycle(input?: DirectorCycleInput): Promise<string> {
	const response = await apiSend<{ cycle: { cycleId: string } }>(
		'/api/v1/director/cycles',
		'POST',
		input,
	);
	return response.cycle.cycleId;
}

export async function updateProfile(input: DirectorProfileInput): Promise<DirectorProfile> {
	const response = await apiSend<{ profile: DirectorProfile }>(
		'/api/v1/director/profile',
		'PUT',
		input,
	);
	return response.profile;
}

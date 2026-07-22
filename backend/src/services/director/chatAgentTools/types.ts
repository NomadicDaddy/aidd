import type { ChatAgentAction } from 'aidd-shared';

import type { RunLaunchRequest } from '../../../types.ts';

/**
 * The capabilities the agentic Director chat can invoke. Kept as a structural interface (not the
 * concrete services) so the agent loop stays decoupled and unit-testable with a fake context, and so
 * the service-graph wiring can adapt the real services without a circular import.
 */
export interface ChatAgentLaunchedRun {
	id: string;
	mode: string;
	projectName: string;
}

export interface ChatAgentToolContext {
	dismissSuggestion(id: string): Promise<void>;
	getFleetSummary(): Promise<unknown>;
	getProjectDetail(projectId: string): Promise<unknown>;
	getRecipe(recipeId: string): Promise<unknown>;
	getRun(id: string): Promise<unknown>;
	killRun(id: string): Promise<void>;
	launchRun(input: RunLaunchRequest): Promise<ChatAgentLaunchedRun>;
	launchSuggestion(
		id: string
	): Promise<{ id: string; pipelineSessionId: string } | { id: string; runId: string }>;
	listProjects(): Promise<unknown>;
	listSuggestions(): Promise<unknown>;
	readRunOutput(id: string): Promise<unknown>;
	resolveProjectPath(path: string): Promise<string>;
	startCycle(input: { directive?: string; sessionId?: string }): Promise<{ cycleId: string }>;
	stopRun(id: string): Promise<void>;
}

export interface DispatchContext {
	allowFileEdits: boolean;
	sessionId: string;
}

export interface DispatchResult {
	action: ChatAgentAction;
	resultText: string;
}

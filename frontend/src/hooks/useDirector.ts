import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DirectorProfileInput } from '../api/types.ts';

import {
	createChatSession,
	deleteChatSession,
	dismissSuggestion,
	getFleetSummary,
	getProfile,
	launchSuggestion,
	listChatMessages,
	listChatSessions,
	listDirectorCycles,
	listSuggestions,
	sendChatMessage,
	triggerDirectorCycle,
	updateProfile,
} from '../api/director.ts';

export function useFleetSummary() {
	return useQuery({
		queryFn: ({ signal }) => getFleetSummary(signal),
		queryKey: ['director', 'fleet'],
	});
}

export function useSuggestions() {
	return useQuery({ queryFn: listSuggestions, queryKey: ['suggestions'] });
}

export function useDirectorCycles() {
	return useQuery({
		queryFn: listDirectorCycles,
		queryKey: ['director-cycles'],
	});
}

export function useDirector(sessionId?: string) {
	const queryClient = useQueryClient();
	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: ['suggestions'] });
		void queryClient.invalidateQueries({ queryKey: ['director-cycles'] });
		void queryClient.invalidateQueries({ queryKey: ['director', 'fleet'] });
	};
	return {
		chatMessages: useQuery({
			enabled: Boolean(sessionId),
			queryFn: () => listChatMessages(sessionId!),
			queryKey: ['director-chat-messages', sessionId],
		}),
		chatSessions: useQuery({
			queryFn: listChatSessions,
			queryKey: ['director-chat-sessions'],
		}),
		createChatSession: useMutation({
			mutationFn: createChatSession,
			onSuccess(session) {
				void queryClient.invalidateQueries({ queryKey: ['director-chat-sessions'] });
				void queryClient.invalidateQueries({
					queryKey: ['director-chat-messages', session.id],
				});
			},
		}),
		cycles: useDirectorCycles(),
		deleteChatSession: useMutation({
			mutationFn: deleteChatSession,
			onSuccess(_result, sessionId) {
				void queryClient.invalidateQueries({ queryKey: ['director-chat-sessions'] });
				void queryClient.removeQueries({
					queryKey: ['director-chat-messages', sessionId],
				});
			},
		}),
		dismissSuggestion: useMutation({ mutationFn: dismissSuggestion, onSuccess: refresh }),
		fleet: useFleetSummary(),
		launchSuggestion: useMutation({ mutationFn: launchSuggestion, onSuccess: refresh }),
		profile: useQuery({ queryFn: getProfile, queryKey: ['director-profile'] }),
		sendChatMessage: useMutation({
			mutationFn: ({ content, id }: { content: string; id: string }) =>
				sendChatMessage(id, content),
			onError(_error, variables) {
				// The backend persists the user message (and a system error message) even
				// when the assistant turn fails. Refetch so the user sees their message
				// instead of it silently disappearing.
				void queryClient.invalidateQueries({
					queryKey: ['director-chat-messages', variables.id],
				});
				void queryClient.invalidateQueries({ queryKey: ['director-chat-sessions'] });
			},
			onSuccess(_messages, variables) {
				void queryClient.invalidateQueries({
					queryKey: ['director-chat-messages', variables.id],
				});
				void queryClient.invalidateQueries({ queryKey: ['director-chat-sessions'] });
				// An agentic chat turn may have launched runs, cycles, or acted on suggestions.
				void queryClient.invalidateQueries({ queryKey: ['runs'] });
				void queryClient.invalidateQueries({ queryKey: ['suggestions'] });
				void queryClient.invalidateQueries({ queryKey: ['director-cycles'] });
				void queryClient.invalidateQueries({ queryKey: ['director', 'fleet'] });
			},
		}),
		suggestions: useSuggestions(),
		triggerCycle: useMutation({ mutationFn: triggerDirectorCycle, onSuccess: refresh }),
		updateProfile: useMutation({
			mutationFn: (input: DirectorProfileInput) => updateProfile(input),
			onSuccess() {
				void queryClient.invalidateQueries({ queryKey: ['director-profile'] });
			},
		}),
	};
}

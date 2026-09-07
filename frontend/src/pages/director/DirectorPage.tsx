/* eslint-disable react-hooks/set-state-in-effect */
import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DirectorComposer } from '../../components/shared/DirectorComposer.tsx';
import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { LaunchTargetBadge } from '../../components/shared/LaunchTargetControl.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useDirector } from '../../hooks/useDirector.ts';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useNow } from '../../hooks/useNow.ts';
import { useSettingsConfig } from '../../hooks/useSettings.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';
import { ActiveCycleLoading, ActiveCyclePanel } from './ActiveCyclePanel.tsx';
import { DirectorChatSection } from './DirectorChatSection.tsx';
import { useDirectorMobileLayout } from './directorDisclosure.ts';
import { DirectorRecentCycles } from './DirectorRecentCycles.tsx';
import { DirectorSuggestionsList } from './DirectorSuggestions.tsx';
import { NextAutomaticCycle } from './NextAutomaticCycle.tsx';

const PAGE_RAIL = pageRailByContentType.data;

export function DirectorPage() {
	useDocumentTitle('Director');
	const [activeSessionId, setActiveSessionId] = useState<string>();
	const [chatInput, setChatInput] = useState('');
	const [pendingChatMessage, setPendingChatMessage] = useState<{
		content: string;
		sessionId: string;
	} | null>(null);
	const [cycleDirective, setCycleDirective] = useState('');
	const [deleteSessionId, setDeleteSessionId] = useState<string>();
	const isMobileLayout = useDirectorMobileLayout();
	const director = useDirector(activeSessionId);
	const suggestions = director.suggestions.data ?? [];
	const cycles = director.cycles.data ?? [];
	const cyclesLoading = director.cycles.isLoading && director.cycles.data === undefined;
	const sessions = director.chatSessions.data ?? [];
	const firstSessionId = director.chatSessions.data?.[0]?.id;
	const messages = director.chatMessages.data ?? [];
	const pendingChatContent =
		pendingChatMessage && pendingChatMessage.sessionId === activeSessionId
			? pendingChatMessage.content
			: null;
	const deleteSession = sessions.find((session) => session.id === deleteSessionId);
	const activeCycle = cycles.find((cycle) => cycle.status === 'running');
	const now = useNow(Boolean(activeCycle) || director.triggerCycle.isPending);
	const settings = useSettingsConfig();
	const profile = director.profile.data;
	// Cycles run on the persisted director profile (or the Direct-AI surface when enabled) —
	// there is no per-cycle override, so the badge is read-only and points at the profile editor.
	const directAiActive = Boolean(
		settings.data?.directAi.enabled && settings.data.directAi.surfaces.directorCycle,
	);
	const directProvider =
		settings.data?.directAi.provider ?? settings.data?.defaultProvider ?? undefined;
	const directProviderSettings = directProvider
		? settings.data?.providers[directProvider]
		: undefined;
	const cycleTargetBackend = directAiActive ? 'direct' : (profile?.backend ?? '');
	const cycleTargetModel = directAiActive
		? (profile?.model ?? settings.data?.directAi.model ?? directProviderSettings?.model ?? null)
		: (profile?.model ?? null);
	const cycleTargetReasoning = directAiActive
		? (profile?.reasoningEffort ??
			settings.data?.directAi.reasoningEffort ??
			directProviderSettings?.reasoningEffort ??
			settings.data?.reasoningEffort ??
			null)
		: (profile?.reasoningEffort ?? null);

	useEffect(() => {
		if (!activeSessionId && firstSessionId) setActiveSessionId(firstSessionId);
	}, [activeSessionId, firstSessionId]);

	function startSession(): void {
		director.createChatSession.mutate('Director Chat', {
			onError(error) {
				toast.error(error instanceof Error ? error.message : 'Director chat start failed');
			},
			onSuccess(session) {
				setActiveSessionId(session.id);
			},
		});
	}

	function sendMessage(): void {
		const sessionId = activeSessionId;
		if (!sessionId) {
			toast.error('Start a Director chat first');
			return;
		}
		const content = chatInput.trim();
		if (!content) return;
		setChatInput('');
		setPendingChatMessage({ content, sessionId });
		director.sendChatMessage.mutate(
			{ content, id: sessionId },
			{
				onError(error) {
					setChatInput(content);
					toast.error(error instanceof Error ? error.message : 'Director chat failed');
				},
				onSettled() {
					setPendingChatMessage((current) =>
						current?.sessionId === sessionId ? null : current,
					);
				},
			},
		);
	}

	function confirmDeleteSession(): void {
		const sessionId = deleteSessionId;
		if (!sessionId) return;
		director.deleteChatSession.mutate(sessionId, {
			onError(error) {
				toast.error(error instanceof Error ? error.message : 'Director chat delete failed');
			},
			onSuccess() {
				setDeleteSessionId(undefined);
				setActiveSessionId((current) => {
					if (current !== sessionId) return current;
					return sessions.find((session) => session.id !== sessionId)?.id;
				});
				toast.success('Director chat deleted');
			},
		});
	}

	function triggerCycle(): void {
		const directive = cycleDirective.trim();
		director.triggerCycle.mutate(
			{
				...(activeSessionId ? { sessionId: activeSessionId } : {}),
				...(directive ? { directive } : {}),
			},
			{
				onError(error) {
					toast.error(error instanceof Error ? error.message : 'Director cycle failed');
				},
				onSuccess() {
					setCycleDirective('');
					toast.success('Director cycle completed');
				},
			},
		);
	}

	function launchSuggestion(id: string): void {
		director.launchSuggestion.mutate(id, {
			onError(error) {
				toast.error(error instanceof Error ? error.message : 'Suggestion launch failed');
			},
			// Losing the claim to the Director's own launcher is not a failure and must not read as
			// one: the work the operator asked for is running, started seconds earlier by something
			// they could not have seen. Saying so is the whole of what they need to know.
			onSuccess(outcome) {
				if (outcome.claimedElsewhere) {
					toast.info('Already launched by the Director; nothing new was started');
				}
			},
		});
	}

	function dismissSuggestion(id: string): void {
		director.dismissSuggestion.mutate(id, {
			onError(error) {
				toast.error(error instanceof Error ? error.message : 'Suggestion dismiss failed');
			},
			onSuccess() {
				toast.success('Suggestion dismissed');
			},
		});
	}

	return (
		<PageRail className="page-reveal @container space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				description="Run a fleet analysis cycle, then act on the suggestions it produces."
				helpSlug="director"
				title="Director"
			/>
			{/* The operational queue gets the majority of the rail. Chat remains available for
			    reviewing context, but the page's primary run-and-act workflow owns the wider track. */}
			<div className="grid items-start gap-5 @min-[68rem]:grid-cols-[minmax(0,3fr)_minmax(28rem,2fr)]">
				{/* Match the page's stated workflow in DOM and visual order: run a Cycle, act on
				    its Suggestions, then inspect completed-cycle history for reference. */}
				<div className="min-w-0 space-y-5">
					<section aria-labelledby="director-cycle-heading">
						{/* The shared stacked layout measures this card, keeping the launch identity
						    beside the heading whenever their real widths fit. */}
						<Card className="@container">
							<CardHeader
								action={
									cycleTargetBackend ? (
										<LaunchTargetBadge
											backend={cycleTargetBackend}
											hint={
												directAiActive
													? 'Cycles use the Direct AI surface — configure under Settings → Direct AI'
													: 'Cycles use the Director profile below — no per-cycle override'
											}
											model={cycleTargetModel}
											provider={directAiActive ? directProvider : undefined}
											reasoningEffort={cycleTargetReasoning}
										/>
									) : undefined
								}
								actionLayout="stacked"
								description={
									<span className="max-sm:hidden">
										Trigger a director analysis pass across the fleet. An
										optional directive focuses the cycle on a specific concern.
									</span>
								}
								id="director-cycle-heading"
								title="Run Cycle"
							/>
							<DirectorComposer
								ariaLabel="Cycle directive"
								canSubmit={!director.triggerCycle.isPending}
								disabled={director.triggerCycle.isPending}
								id="director-cycle-composer"
								label="Cycle Directive (optional)"
								onChange={setCycleDirective}
								onSubmit={triggerCycle}
								placement="inline"
								submitLabel={
									director.triggerCycle.isPending ? 'Running…' : 'Run Cycle'
								}
								value={cycleDirective}
							/>
							<NextAutomaticCycle />
							{cyclesLoading ? (
								<ActiveCycleLoading />
							) : activeCycle ? (
								<ActiveCyclePanel cycle={activeCycle} now={now} />
							) : director.triggerCycle.isPending ? (
								<div
									className={`mt-4 min-h-40 rounded-md border p-3 text-sm text-foreground ${toneBorder.teal} ${toneSurface.teal}`}>
									<div className="flex items-center gap-2 font-medium text-foreground">
										<Activity className={`h-4 w-4 ${toneText.teal}`} />
										Starting director cycle
									</div>
									<p className="mt-1">
										Waiting for the backend to publish the cycle record.
									</p>
								</div>
							) : (
								<EmptyState className="mt-4 min-h-40">
									No director cycle is running.
								</EmptyState>
							)}
						</Card>
					</section>
					<DirectorSuggestionsList
						loading={director.suggestions.isLoading}
						onDismiss={dismissSuggestion}
						onLaunch={launchSuggestion}
						suggestions={suggestions}
					/>
					<DirectorRecentCycles cycles={cycles} loading={cyclesLoading} now={now} />
				</div>

				<DirectorChatSection
					activeSessionId={activeSessionId}
					chatInput={chatInput}
					createPending={director.createChatSession.isPending}
					deletePending={director.deleteChatSession.isPending}
					deleteSession={deleteSession}
					isMobileLayout={isMobileLayout}
					messages={messages}
					onChatInputChange={setChatInput}
					onCloseDeleteSession={() => setDeleteSessionId(undefined)}
					onConfirmDeleteSession={confirmDeleteSession}
					onRequestDeleteSession={setDeleteSessionId}
					onSelectSession={setActiveSessionId}
					onSendMessage={sendMessage}
					onStartSession={startSession}
					pendingContent={pendingChatContent}
					sendPending={director.sendChatMessage.isPending}
					sessions={sessions}
				/>
			</div>
		</PageRail>
	);
}

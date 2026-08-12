/* eslint-disable react-hooks/set-state-in-effect */
import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as Bot } from 'lucide-react/dist/esm/icons/bot';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { LaunchTargetBadge } from '../../components/shared/LaunchTargetControl.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useDirector } from '../../hooks/useDirector.ts';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useNow } from '../../hooks/useNow.ts';
import { useSettingsConfig } from '../../hooks/useSettings.ts';
import { cn } from '../../lib/cn.ts';
import { fieldLabelClass } from '../../lib/formStyles.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';
import { ActiveCyclePanel } from './ActiveCyclePanel.tsx';
import { DirectorChatSection } from './DirectorChatSection.tsx';
import { useDirectorMobileLayout } from './directorDisclosure.ts';
import { DirectorRecentCycles } from './DirectorRecentCycles.tsx';
import { DirectorSuggestionsList } from './DirectorSuggestions.tsx';
import { textareaClass } from './directorUtils.ts';

export function DirectorPage() {
	useDocumentTitle('Director');
	const [activeSessionId, setActiveSessionId] = useState<string>();
	const [chatInput, setChatInput] = useState('');
	const [cycleDirective, setCycleDirective] = useState('');
	const [deleteSessionId, setDeleteSessionId] = useState<string>();
	const isMobileLayout = useDirectorMobileLayout();
	const director = useDirector(activeSessionId);
	const suggestions = director.suggestions.data ?? [];
	const cycles = director.cycles.data ?? [];
	const sessions = useMemo(() => director.chatSessions.data ?? [], [director.chatSessions.data]);
	const messages = director.chatMessages.data ?? [];
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
		if (!activeSessionId && sessions[0]) setActiveSessionId(sessions[0].id);
	}, [activeSessionId, sessions]);

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
		if (!activeSessionId) {
			toast.error('Start a Director chat first');
			return;
		}
		const content = chatInput.trim();
		if (!content) return;
		setChatInput('');
		director.sendChatMessage.mutate(
			{ content, id: activeSessionId },
			{
				onError(error) {
					setChatInput(content);
					toast.error(error instanceof Error ? error.message : 'Director chat failed');
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
		<div className="page-reveal @container space-y-5">
			<PageHeader
				description="Run a fleet analysis cycle, then act on the suggestions it produces."
				helpSlug="director"
				title="Director"
			/>

			{/* The split gates on this column's width, not the window's. `lg:` split at 1024px of
			    viewport, which with the rail expanded is a 752px column and two 366px halves — and
			    Director Chat, the taller and more interactive of the two, cannot work at 366px. It
			    holds off until each half clears ~500px, which is the width the chat card needs
			    before its own rail can appear inside it. */}
			<div className="grid gap-5 @min-[68rem]:grid-cols-2">
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
					sendPending={director.sendChatMessage.isPending}
					sessions={sessions}
				/>

				{/* Run Cycle is a short card; Director Chat beside it is 420px tall, so the right
				    column ended in a tall empty band while Recent Cycles sat below in a second
				    two-column row. Cycles stack under the control that produces them. */}
				<div className="space-y-5">
					<section aria-labelledby="director-cycle-heading">
						<Card>
							<CardHeader
								action={
									<div className="flex flex-wrap items-center gap-2">
										{cycleTargetBackend ? (
											<LaunchTargetBadge
												backend={cycleTargetBackend}
												hint={
													directAiActive
														? 'Cycles use the Direct AI surface — configure under Settings → Direct AI'
														: 'Cycles use the Director profile below — no per-cycle override'
												}
												model={cycleTargetModel}
												provider={
													directAiActive ? directProvider : undefined
												}
												reasoningEffort={cycleTargetReasoning}
											/>
										) : null}
										<Button
											className="max-sm:order-first"
											disabled={director.triggerCycle.isPending}
											onClick={triggerCycle}
											variant="primary">
											<Bot className="h-4 w-4" />
											{director.triggerCycle.isPending
												? 'Running…'
												: 'Run Cycle'}
										</Button>
									</div>
								}
								description={
									<span className="max-sm:hidden">
										Trigger a director analysis pass across the fleet. An
										optional directive focuses the cycle on a specific concern.
									</span>
								}
								id="director-cycle-heading"
								title="Run Cycle"
							/>
							<label className="block space-y-1">
								<span className={fieldLabelClass}>Cycle Directive (optional)</span>
								{/* `cn`, not a template string. `textareaClass` already carries
								    `min-h-28`, so concatenating `min-h-16` put both on the element and
								    Tailwind's own cascade order — not the order they were written in —
								    decided between them. `min-h-28` won, and this field, which the card
								    labels optional, rendered 937x112px at 2250: an empty box about the
								    size of the entire Recent Cycles row beneath it. tailwind-merge
								    resolves the conflict in favour of the call site, which is the only
								    reason to write an override at all. `resize-y` is on the shared
								    class, so a long directive can still grow the field. */}
								<textarea
									className={cn(textareaClass, 'min-h-16')}
									onChange={(event) => setCycleDirective(event.target.value)}
									placeholder="e.g. prioritize failing builds across the fleet"
									value={cycleDirective}
								/>
							</label>
							{activeCycle ? (
								<ActiveCyclePanel cycle={activeCycle} now={now} />
							) : director.triggerCycle.isPending ? (
								<div
									className={`mt-4 rounded-md border p-3 text-sm text-foreground ${toneBorder.teal} ${toneSurface.teal}`}>
									<div className="flex items-center gap-2 font-medium text-foreground">
										<Activity className={`h-4 w-4 ${toneText.teal}`} />
										Starting director cycle
									</div>
									<p className="mt-1">
										Waiting for the backend to publish the cycle record.
									</p>
								</div>
							) : null}
						</Card>
					</section>
					<DirectorRecentCycles cycles={cycles} now={now} />
				</div>
			</div>

			{/* Full width: a suggestion is a title, a two-line description and four actions, which
			    is a row, not a column. In half the page they wrapped onto three and four lines. */}
			<DirectorSuggestionsList
				isMobileLayout={isMobileLayout}
				onDismiss={dismissSuggestion}
				onLaunch={launchSuggestion}
				suggestions={suggestions}
			/>
		</div>
	);
}

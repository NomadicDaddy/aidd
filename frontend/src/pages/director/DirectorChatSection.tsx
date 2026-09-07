import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as ExternalLink } from 'lucide-react/dist/esm/icons/external-link';
import { default as MessageSquarePlus } from 'lucide-react/dist/esm/icons/message-square-plus';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { default as Zap } from 'lucide-react/dist/esm/icons/zap';
import { useState } from 'react';
import { Link } from 'react-router';

import type { ChatAgentAction } from '../../api/types.ts';

import {
	ChatMessageBubble,
	PendingChatMessage,
} from '../../components/shared/ChatMessageBubble.tsx';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { DirectorComposer } from '../../components/shared/DirectorComposer.tsx';
import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Button, IconButton } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { usePinnedChatTranscript } from '../../hooks/usePinnedChatTranscript.ts';
import { formatDate, formatTimeOfDay } from '../../lib/formatters.ts';
import { toneText } from '../../lib/tones.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { compactChatSessions, MOBILE_CHAT_PREVIEW_COUNT } from './directorDisclosure.ts';

export type ChatSession = { id: string; title: string; updatedAt: number };
export type ChatMessage = {
	actions?: ChatAgentAction[];
	content: string;
	id: string;
	role: 'assistant' | 'system' | 'user';
};

function chatSessionTitle(session: ChatSession): string {
	return session.title === 'Director Chat'
		? `New chat · ${formatTimeOfDay(session.updatedAt)}`
		: session.title;
}

function ChatActionTrail({ actions }: { actions: ChatAgentAction[] }) {
	return (
		<ul className="mt-2 space-y-1 border-t border-border pt-2">
			{actions.map((action, index) => {
				const isError = action.status === 'error';
				const runHref = action.runId
					? `/runs?run=${encodeURIComponent(action.runId)}`
					: null;
				return (
					<li
						className={`flex items-center gap-1.5 text-xs ${
							isError ? toneText.red : 'text-foreground'
						}`}
						key={`${action.tool}-${index}`}>
						{isError ? (
							<AlertTriangle className="h-3.5 w-3.5 shrink-0" />
						) : (
							<Zap className="h-3.5 w-3.5 shrink-0" />
						)}
						<span className="min-w-0 truncate">{action.summary}</span>
						{runHref && (
							<Link
								className={`inline-flex shrink-0 items-center gap-1 font-medium text-accent hover:underline ${touchTargetTextClass}`}
								to={runHref}>
								<ExternalLink className="h-3 w-3" />
								run
							</Link>
						)}
					</li>
				);
			})}
		</ul>
	);
}

export function DirectorChatSection({
	activeSessionId,
	chatInput,
	createPending,
	deletePending,
	deleteSession,
	isMobileLayout,
	messages,
	onChatInputChange,
	onCloseDeleteSession,
	onConfirmDeleteSession,
	onRequestDeleteSession,
	onSelectSession,
	onSendMessage,
	onStartSession,
	pendingContent,
	sendPending,
	sessions,
}: {
	activeSessionId: string | undefined;
	chatInput: string;
	createPending: boolean;
	deletePending: boolean;
	deleteSession: ChatSession | undefined;
	isMobileLayout: boolean;
	messages: ChatMessage[];
	onChatInputChange: (value: string) => void;
	onCloseDeleteSession: () => void;
	onConfirmDeleteSession: () => void;
	onRequestDeleteSession: (id: string) => void;
	onSelectSession: (id: string) => void;
	onSendMessage: () => void;
	onStartSession: () => void;
	pendingContent: null | string;
	sendPending: boolean;
	sessions: ChatSession[];
}) {
	const [showAllChats, setShowAllChats] = useState(false);
	const transcriptRef = usePinnedChatTranscript({
		conversationId: activeSessionId,
		messageCount: messages.length,
		pendingContent,
	});
	const canSend = Boolean(activeSessionId) && !sendPending && chatInput.trim().length > 0;
	const displayedSessions =
		isMobileLayout && !showAllChats ? compactChatSessions(sessions, activeSessionId) : sessions;
	const hasHiddenSessions = sessions.length > MOBILE_CHAT_PREVIEW_COUNT;

	return (
		// Chat stays available beside the operational queue without claiming the viewport's height.
		<section
			aria-labelledby="director-chat-heading"
			className="@min-[68rem]:sticky @min-[68rem]:top-5">
			<ConfirmDialog
				cancelLabel="Keep Chat"
				confirmLabel="Delete Chat"
				description={
					deleteSession
						? `Delete "${chatSessionTitle(deleteSession)}" and its message history?`
						: undefined
				}
				destructive
				isPending={deletePending}
				onClose={onCloseDeleteSession}
				onConfirm={onConfirmDeleteSession}
				open={Boolean(deleteSession)}
				title="Delete Director chat?"
			/>
			<Card className="@container flex min-h-[420px] flex-col">
				<CardHeader
					className="mb-3"
					description={
						<span className="max-sm:hidden">
							Ask the director about fleet state in a focused conversation.
						</span>
					}
					id="director-chat-heading"
					title="Director Chat"
				/>
				{/* Gate against the card: 45rem fits a readable rail beside a useful transcript.
				    Below that, the taller stacked rail keeps several sessions visible. */}
				<div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 @min-[45rem]:grid-cols-[minmax(14rem,1fr)_minmax(28rem,2fr)] @min-[45rem]:grid-rows-1">
					<div className="flex min-h-0 min-w-0 flex-col gap-2">
						<div className="flex items-center justify-between gap-2">
							<h3 className="text-sm font-semibold text-foreground">Chats</h3>
							{/* The one constructive action in this column was an unlabelled ghost
							    glyph while the per-row Delete beside it carried the highest chroma
							    on the surface — the page pointed at destruction and hid creation.
							    It says what it does now. */}
							<Button
								disabled={createPending}
								onClick={onStartSession}
								size="compact"
								variant="secondary">
								<MessageSquarePlus className="h-3.5 w-3.5" />
								New chat
							</Button>
						</div>
						{/* A stacked rail gets several rows; beside the conversation it shares that row's
						    natural height and scrolls rather than lengthening the card. */}
						<OverflowScroller
							ariaLabel="Director chat sessions"
							className="min-h-0 @min-[45rem]:flex-1"
							id="director-chat-sessions"
							scrollerClassName="max-h-56 space-y-2 @min-[45rem]:h-full @min-[45rem]:max-h-none"
							showTopCue>
							{displayedSessions.map((session) => {
								const isActive = session.id === activeSessionId;
								const displayTitle = chatSessionTitle(session);
								const sessionContext = `${displayTitle} (${formatDate(
									session.updatedAt,
								)})`;
								return (
									// bg-muted against bg-card was a ~4% luminance step, so the
									// selected chat was indistinguishable from the four below it and
									// nothing said which transcript was on screen.
									//
									// The inactive branch also had no rest affordance: five rows
									// that each swap the transcript on click looked exactly as
									// inert as the card holding them. `hover:bg-muted/60` is the
									// Audits catalog treatment; the selected branch is untouched
									// so the two states never compete.
									<div
										className={`grid grid-cols-[minmax(0,1fr)_2.75rem] items-stretch rounded-md border text-sm transition-colors ${
											isActive
												? 'border-accent bg-accent-muted text-accent-muted-foreground'
												: 'border-border bg-card text-foreground hover:bg-muted/60'
										}`}
										key={session.id}>
										<button
											aria-current={isActive ? 'true' : undefined}
											className="min-w-0 rounded-l-md px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none max-sm:flex max-sm:min-h-11 max-sm:items-center max-sm:gap-2 max-sm:py-1"
											onClick={() => onSelectSession(session.id)}
											type="button">
											<div className="truncate font-medium max-sm:flex-1">
												{displayTitle}
											</div>
											<div className="mt-1 shrink-0 text-xs text-muted-foreground max-sm:mt-0">
												{formatDate(session.updatedAt)}
											</div>
										</button>
										{/* A ghost, not a filled danger control: this was the loudest
										    thing in the left half of the page, repeated once per
										    row, for an action nobody is looking for. The
										    confirmation dialog is where the weight belongs. */}
										<IconButton
											ariaLabel={`Delete Director chat: ${sessionContext}`}
											className="m-1 self-center"
											disabled={deletePending}
											onClick={() => onRequestDeleteSession(session.id)}
											title={`Delete ${sessionContext}`}
											variant="ghost">
											<Trash2 className="h-4 w-4" />
										</IconButton>
									</div>
								);
							})}
							{sessions.length === 0 && (
								<p className="text-sm text-muted-foreground">No chats yet.</p>
							)}
						</OverflowScroller>
						{isMobileLayout && hasHiddenSessions ? (
							<Button
								aria-controls="director-chat-sessions"
								aria-expanded={showAllChats}
								className="w-full"
								onClick={() => setShowAllChats((current) => !current)}
								size="compact"
								variant="ghost">
								<DisclosureMarker open={showAllChats} />
								{showAllChats ? 'Show recent chats' : 'View all chats'}
							</Button>
						) : null}
					</div>

					<div className="flex min-w-0 flex-col rounded-md border border-border sm:h-96 @min-[45rem]:h-[28rem]">
						<OverflowScroller
							ariaLabel="Director chat conversation"
							ariaLive="polite"
							className="min-h-0 flex-1"
							role="log"
							scrollerClassName="space-y-3 p-3 sm:h-full"
							scrollerRef={transcriptRef}
							showTopCue>
							{messages.map((message) => (
								<ChatMessageBubble
									content={message.content}
									key={message.id}
									role={message.role}>
									{message.actions && message.actions.length > 0 && (
										<ChatActionTrail actions={message.actions} />
									)}
								</ChatMessageBubble>
							))}
							{pendingContent ? (
								<PendingChatMessage content={pendingContent} />
							) : null}
							{messages.length === 0 && !pendingContent && (
								<p className="text-sm text-muted-foreground">No messages yet.</p>
							)}
						</OverflowScroller>
						<DirectorComposer
							ariaLabel="Director chat message"
							canSubmit={canSend}
							disabled={!activeSessionId || sendPending}
							id="director-chat-composer"
							onChange={onChatInputChange}
							onSubmit={onSendMessage}
							placement="chat"
							submitLabel="Send"
							value={chatInput}
						/>
					</div>
				</div>
			</Card>
		</section>
	);
}

import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as ExternalLink } from 'lucide-react/dist/esm/icons/external-link';
import { default as MessageSquarePlus } from 'lucide-react/dist/esm/icons/message-square-plus';
import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { default as Zap } from 'lucide-react/dist/esm/icons/zap';
import { Link } from 'react-router';

import type { ChatAgentAction } from '../../api/types.ts';

import { ChatMessageBubble } from '../../components/shared/ChatMessageBubble.tsx';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { Button, IconButton } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { formatDate } from '../../lib/formatters.ts';
import { toneText } from '../../lib/tones.ts';

export type ChatSession = { id: string; title: string; updatedAt: number };
export type ChatMessage = {
	actions?: ChatAgentAction[];
	content: string;
	id: string;
	role: 'assistant' | 'system' | 'user';
};

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
							isError ? toneText.amber : 'text-foreground'
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
								className="inline-flex shrink-0 items-center gap-1 font-medium text-accent hover:underline"
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
	messages,
	onChatInputChange,
	onCloseDeleteSession,
	onConfirmDeleteSession,
	onRequestDeleteSession,
	onSelectSession,
	onSendMessage,
	onStartSession,
	sendPending,
	sessions,
}: {
	activeSessionId: string | undefined;
	chatInput: string;
	createPending: boolean;
	deletePending: boolean;
	deleteSession: ChatSession | undefined;
	messages: ChatMessage[];
	onChatInputChange: (value: string) => void;
	onCloseDeleteSession: () => void;
	onConfirmDeleteSession: () => void;
	onRequestDeleteSession: (id: string) => void;
	onSelectSession: (id: string) => void;
	onSendMessage: () => void;
	onStartSession: () => void;
	sendPending: boolean;
	sessions: ChatSession[];
}) {
	const canSend = Boolean(activeSessionId) && !sendPending && chatInput.trim().length > 0;
	return (
		<section aria-labelledby="director-chat-heading">
			<ConfirmDialog
				cancelLabel="Keep Chat"
				confirmLabel="Delete Chat"
				description={
					deleteSession
						? `Delete "${deleteSession.title}" and its message history?`
						: undefined
				}
				destructive
				isPending={deletePending}
				onClose={onCloseDeleteSession}
				onConfirm={onConfirmDeleteSession}
				open={Boolean(deleteSession)}
				title="Delete Director chat?"
			/>
			<Card>
				<CardHeader
					className="mb-3"
					description="Ask the director about fleet state in a focused conversation."
					id="director-chat-heading"
					title="Director Chat"
				/>
				{/* The 220px session rail stole a fifth of the width at 768, leaving the transcript
				    ~470px and the composer too narrow for its own Send button. The rail stacks above
				    the transcript until lg, where there is width for both. */}
				<div className="grid min-h-[420px] gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
					<div className="min-w-0 space-y-2">
						<div className="flex items-center justify-between gap-2">
							<h3 className="text-sm font-semibold text-foreground">Chats</h3>
							<IconButton
								ariaLabel="New Director chat"
								disabled={createPending}
								onClick={onStartSession}
								variant="ghost">
								<MessageSquarePlus className="h-4 w-4" />
							</IconButton>
						</div>
						<div className="space-y-2">
							{sessions.map((session) => {
								const isActive = session.id === activeSessionId;
								const sessionContext = `${session.title} (${formatDate(
									session.updatedAt,
								)})`;
								return (
									// bg-muted against bg-card was a ~4% luminance step, so the
									// selected chat was indistinguishable from the four below it and
									// nothing said which transcript was on screen.
									<div
										className={`grid grid-cols-[minmax(0,1fr)_2.75rem] items-stretch rounded-md border text-sm ${
											isActive
												? 'border-accent bg-accent-muted text-accent-muted-foreground'
												: 'border-border bg-card text-foreground'
										}`}
										key={session.id}>
										<button
											aria-current={isActive ? 'true' : undefined}
											className="min-w-0 rounded-l-md px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
											onClick={() => onSelectSession(session.id)}
											type="button">
											<div className="truncate font-medium">
												{session.title}
											</div>
											<div className="mt-1 text-xs text-muted-foreground">
												{formatDate(session.updatedAt)}
											</div>
										</button>
										<IconButton
											ariaLabel={`Delete Director chat: ${sessionContext}`}
											className="m-1 self-center"
											disabled={deletePending}
											onClick={() => onRequestDeleteSession(session.id)}
											title={`Delete ${sessionContext}`}
											variant="danger">
											<Trash2 className="h-4 w-4" />
										</IconButton>
									</div>
								);
							})}
							{sessions.length === 0 && (
								<p className="text-sm text-muted-foreground">No chats yet.</p>
							)}
						</div>
					</div>

					<div className="flex min-h-0 min-w-0 flex-col rounded-md border border-border">
						<div
							aria-live="polite"
							className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
							role="log">
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
							{messages.length === 0 && (
								<p className="text-sm text-muted-foreground">No messages yet.</p>
							)}
						</div>
						<div className="border-t border-border p-3">
							{/* min-w-0 on the row: without it the Input's intrinsic width kept the
							    flex row from shrinking and Send was pushed off the composer at 768. */}
							<div className="flex min-w-0 gap-2">
								<Input
									aria-label="Director chat message"
									className="flex-1"
									disabled={!activeSessionId || sendPending}
									onChange={(event) => onChatInputChange(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === 'Enter' && canSend) onSendMessage();
									}}
									placeholder="Ask about fleet state…"
									value={chatInput}
								/>
								<Button
									disabled={!canSend}
									onClick={onSendMessage}
									variant="primary">
									<Send className="h-4 w-4" />
									Send
								</Button>
							</div>
						</div>
					</div>
				</div>
			</Card>
		</section>
	);
}

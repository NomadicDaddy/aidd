import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as ExternalLink } from 'lucide-react/dist/esm/icons/external-link';
import { default as MessageSquarePlus } from 'lucide-react/dist/esm/icons/message-square-plus';
import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { default as Zap } from 'lucide-react/dist/esm/icons/zap';
import { Link } from 'react-router';

import type { ChatAgentAction } from '../../api/types.ts';

import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { Button, IconButton } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { formatDate } from '../../lib/formatters.ts';
import { sectionDescClass, sectionTitleClass } from './directorUtils.ts';

export type ChatSession = { id: string; title: string; updatedAt: number };
export type ChatMessage = {
	actions?: ChatAgentAction[];
	content: string;
	id: string;
	role: 'assistant' | 'system' | 'user';
};

function ChatActionTrail({ actions }: { actions: ChatAgentAction[] }) {
	return (
		<ul className="mt-2 space-y-1 border-t border-neutral-200 pt-2 dark:border-neutral-700">
			{actions.map((action, index) => {
				const isError = action.status === 'error';
				const runHref = action.runId
					? `/runs?run=${encodeURIComponent(action.runId)}`
					: null;
				return (
					<li
						className={`flex items-center gap-1.5 text-xs ${
							isError
								? 'text-amber-700 dark:text-amber-300'
								: 'text-neutral-600 dark:text-neutral-400'
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
								className="inline-flex shrink-0 items-center gap-1 font-medium text-teal-700 hover:underline dark:text-teal-300"
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
				<div className="mb-3">
					<h2 className={sectionTitleClass} id="director-chat-heading">
						Director Chat
					</h2>
					<p className={sectionDescClass}>
						Ask the director about fleet state in a focused conversation.
					</p>
				</div>
				<div className="grid min-h-[420px] gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
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
									<div
										className={`grid grid-cols-[minmax(0,1fr)_2.75rem] items-stretch rounded-md border text-sm ${
											isActive
												? 'border-neutral-900 bg-neutral-100 text-neutral-950 dark:border-neutral-100 dark:bg-neutral-800 dark:text-neutral-50'
												: 'border-neutral-200 bg-white text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300'
										}`}
										key={session.id}>
										<button
											aria-current={isActive ? 'true' : undefined}
											className="min-w-0 rounded-l-md px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-slate-950"
											onClick={() => onSelectSession(session.id)}
											type="button">
											<div className="truncate font-medium">
												{session.title}
											</div>
											<div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
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
								<p className="text-sm text-neutral-500 dark:text-neutral-400">
									No chats yet.
								</p>
							)}
						</div>
					</div>

					<div className="flex min-h-0 min-w-0 flex-col rounded-md border border-neutral-200 dark:border-neutral-800">
						<div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
							{messages.map((message) => (
								<div
									className={`rounded-md px-3 py-2 text-sm ${
										message.role === 'user'
											? 'ml-auto max-w-[82%] bg-neutral-900 text-white dark:bg-neutral-700'
											: message.role === 'assistant'
												? 'max-w-[88%] bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
												: 'max-w-[88%] bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
									}`}
									key={message.id}>
									<div className="break-words whitespace-pre-wrap">
										{message.content}
									</div>
									{message.actions && message.actions.length > 0 && (
										<ChatActionTrail actions={message.actions} />
									)}
								</div>
							))}
							{messages.length === 0 && (
								<p className="text-sm text-neutral-500 dark:text-neutral-400">
									No messages yet.
								</p>
							)}
						</div>
						<div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
							<div className="flex gap-2">
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

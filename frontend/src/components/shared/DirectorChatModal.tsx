/* eslint-disable react-hooks/set-state-in-effect */
import { default as Bot } from 'lucide-react/dist/esm/icons/bot';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { useDirector } from '../../hooks/useDirector.ts';
import { usePinnedChatTranscript } from '../../hooks/usePinnedChatTranscript.ts';
import { IconButton } from '../ui/button.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';
import { ChatMessageBubble, PendingChatMessage } from './ChatMessageBubble.tsx';
import { DirectorComposer } from './DirectorComposer.tsx';
import { OverflowScroller } from './OverflowScroller.tsx';

/**
 * Global "press c to talk to the Director" capture surface. Opened from any page
 * (see useKeyboardShortcuts). Unlike a fire-and-forget capture box, it shows the live
 * conversation so the user gets confirmation the Director received the message and
 * can watch the reply or keep chatting — yet it can be dismissed at any point. The
 * message is persisted server-side regardless of whether the modal stays open, and the
 * conversation appears on the Director page as a normal listed chat for later review.
 *
 * Mounted once at the app shell, so its session/pending state survives open/close.
 */
export function DirectorChatModal({ onClose, open }: { onClose: () => void; open: boolean }) {
	const [sessionId, setSessionId] = useState<string>();
	const [input, setInput] = useState('');
	const [pendingContent, setPendingContent] = useState<null | string>(null);
	const director = useDirector(sessionId);
	const sessions = director.chatSessions.data ?? [];
	const firstSessionId = sessions[0]?.id;
	const messages = director.chatMessages.data ?? [];
	const composerRef = useRef<HTMLTextAreaElement | null>(null);
	const transcriptRef = usePinnedChatTranscript({
		active: open,
		conversationId: sessionId,
		messageCount: messages.length,
		pendingContent,
	});

	// Default to the most recent chat so a capture lands in an existing conversation
	// (and is immediately visible there); a fresh session is created lazily on first
	// send only when none exist yet.
	useEffect(() => {
		if (open && !sessionId && firstSessionId) setSessionId(firstSessionId);
	}, [firstSessionId, open, sessionId]);

	const sending = pendingContent !== null;

	async function submit(): Promise<void> {
		const content = input.trim();
		if (!content || sending) return;
		setInput('');
		setPendingContent(content);
		try {
			let targetId = sessionId;
			if (!targetId) {
				const session = await director.createChatSession.mutateAsync('Director Chat');
				targetId = session.id;
				setSessionId(session.id);
			}
			await director.sendChatMessage.mutateAsync({ content, id: targetId });
			toast.success('Director received your message');
		} catch (error) {
			setInput((current) => current || content);
			toast.error(error instanceof Error ? error.message : 'Director chat failed');
		} finally {
			setPendingContent(null);
		}
	}

	return (
		<Dialog
			aria-labelledby="director-chat-modal-title"
			initialFocusRef={composerRef}
			onClose={onClose}
			open={open}
			role="dialog">
			<DialogPanel className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden">
				<div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
					<div className="flex items-start gap-2">
						<Bot className="mt-0.5 h-4 w-4 text-accent" />
						<div>
							<h2
								className="text-base font-semibold text-foreground"
								id="director-chat-modal-title">
								Director Chat
							</h2>
							<p className="text-xs text-muted-foreground">
								Sent messages are saved — review or continue on the{' '}
								<Link
									className="font-medium text-accent hover:underline"
									onClick={onClose}
									to="/director">
									Director page
								</Link>
								.
							</p>
						</div>
					</div>
					<IconButton
						ariaLabel="Dismiss"
						className="shrink-0"
						onClick={onClose}
						variant="ghost">
						<X className="h-4 w-4" />
					</IconButton>
				</div>

				<OverflowScroller
					ariaLabel="Director chat conversation"
					ariaLive="polite"
					className="min-h-[160px] flex-1"
					role="log"
					scrollerClassName="h-full space-y-3 px-4 py-3"
					scrollerRef={transcriptRef}
					showTopCue
					surface="card">
					{messages.map((message) => (
						<ChatMessageBubble
							content={message.content}
							contentClassName={
								message.role === 'system' ? 'line-clamp-1' : undefined
							}
							key={message.id}
							role={message.role}
						/>
					))}
					{pendingContent ? <PendingChatMessage content={pendingContent} /> : null}
					{messages.length === 0 && !sending && (
						<p className="text-sm text-muted-foreground">
							Type a message to the Director. You can dismiss this anytime — it keeps
							working and the reply is saved.
						</p>
					)}
				</OverflowScroller>

				<DirectorComposer
					ariaLabel="Director chat message"
					canSubmit={!sending && input.trim().length > 0}
					className="px-4 py-3"
					composerRef={composerRef}
					disabled={sending}
					id="director-chat-modal-composer"
					onChange={setInput}
					onSubmit={() => void submit()}
					placement="chat"
					submitLabel="Send"
					value={input}
				/>
			</DialogPanel>
		</Dialog>
	);
}

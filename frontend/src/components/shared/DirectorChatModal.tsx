/* eslint-disable react-hooks/set-state-in-effect */
import { default as Bot } from 'lucide-react/dist/esm/icons/bot';
import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { useDirector } from '../../hooks/useDirector.ts';
import { Button, IconButton } from '../ui/button.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';
import { Input } from '../ui/input.tsx';

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
	const sessions = useMemo(() => director.chatSessions.data ?? [], [director.chatSessions.data]);
	const messages = director.chatMessages.data ?? [];
	const scrollRef = useRef<HTMLDivElement | null>(null);

	// Default to the most recent chat so a capture lands in an existing conversation
	// (and is immediately visible there); a fresh session is created lazily on first
	// send only when none exist yet.
	useEffect(() => {
		if (open && !sessionId && sessions[0]) setSessionId(sessions[0].id);
	}, [open, sessionId, sessions]);

	// Keep the newest message in view as the thread grows or a reply lands.
	useEffect(() => {
		if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
	}, [open, messages.length, pendingContent]);

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
			onClose={onClose}
			open={open}
			role="dialog">
			<DialogPanel className="flex max-h-[80vh] w-full max-w-lg flex-col">
				<div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
					<div className="flex items-center gap-2">
						<Bot className="h-4 w-4 text-teal-700 dark:text-teal-300" />
						<div>
							<h2
								className="text-sm font-semibold text-foreground"
								id="director-chat-modal-title">
								Director Chat
							</h2>
							<p className="text-xs text-neutral-500 dark:text-neutral-400">
								Sent messages are saved — review or continue on the{' '}
								<Link
									className="font-medium text-teal-700 hover:underline dark:text-teal-300"
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

				<div
					className="min-h-[160px] flex-1 space-y-3 overflow-y-auto px-4 py-3"
					ref={scrollRef}>
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
							<div className="break-words whitespace-pre-wrap">{message.content}</div>
						</div>
					))}
					{sending && (
						<>
							<div className="ml-auto max-w-[82%] rounded-md bg-neutral-900 px-3 py-2 text-sm text-white opacity-70 dark:bg-neutral-700">
								<div className="break-words whitespace-pre-wrap">
									{pendingContent}
								</div>
							</div>
							<p className="text-xs text-neutral-500 dark:text-neutral-400">
								Director is thinking…
							</p>
						</>
					)}
					{messages.length === 0 && !sending && (
						<p className="text-sm text-neutral-500 dark:text-neutral-400">
							Type a message to the Director. You can dismiss this anytime — it keeps
							working and the reply is saved.
						</p>
					)}
				</div>

				<div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
					<div className="flex gap-2">
						<Input
							aria-label="Director chat message"
							className="flex-1"
							onChange={(event) => setInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Enter' && !event.shiftKey) {
									event.preventDefault();
									void submit();
								}
							}}
							placeholder="Ask or tell the Director something…"
							value={input}
						/>
						<Button
							disabled={sending || input.trim().length === 0}
							onClick={() => void submit()}
							variant="primary">
							<Send className="h-4 w-4" />
							Send
						</Button>
					</div>
				</div>
			</DialogPanel>
		</Dialog>
	);
}

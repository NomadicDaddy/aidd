import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { toneSurface } from '../../lib/tones.ts';

/** Who wrote a Director chat message. */
export type ChatMessageRole = 'assistant' | 'system' | 'user';

/**
 * Author names, read out before the message body.
 *
 * The bubbles carried their author only in geometry — right-aligned dark fill for the user,
 * left-aligned grey for the Director — so a screen reader got an undifferentiated run of text, and a
 * pasted-in transcript lost the speakers entirely. The label is visually hidden because the
 * alignment already does the work on screen; it is not hidden from assistive technology.
 */
const AUTHOR_LABEL: Record<ChatMessageRole, string> = {
	assistant: 'Director',
	system: 'System',
	user: 'You',
};

/**
 * The system bubble was amber — the tone this app reserves for "needs attention" — so routine
 * transcript scaffolding rendered as a warning next to the Director's own replies. Teal is the
 * informational tone, which is what a system note is.
 */
const ROLE_CLASS: Record<ChatMessageRole, string> = {
	assistant: 'max-w-[88%] bg-muted text-foreground',
	system: cn('max-w-[88%] text-accent-muted-foreground', toneSurface.teal),
	user: 'ml-auto max-w-[82%] bg-foreground text-background',
};

/**
 * One chat bubble, shared by the Director page's chat panel and the global Director chat modal.
 *
 * The two surfaces render the same three roles and had drifted into two different sets of literal
 * colour classes for them; a message that looked like a warning in one place looked like a normal
 * reply in the other.
 */
export function ChatMessageBubble({
	children,
	className,
	content,
	role,
}: {
	children?: ReactNode;
	className?: string;
	content: string;
	role: ChatMessageRole;
}) {
	return (
		<div className={cn('rounded-md px-3 py-2 text-sm', ROLE_CLASS[role], className)}>
			<span className="sr-only">{AUTHOR_LABEL[role]}: </span>
			<div className="break-words whitespace-pre-wrap">{content}</div>
			{children}
		</div>
	);
}

import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { microLabelClass } from '../../lib/typography.ts';

/** Who wrote a Director chat message. */
export type ChatMessageRole = 'assistant' | 'system' | 'user';

/**
 * Author names, printed above the message body.
 *
 * The bubbles carried their author only in geometry — right-aligned dark fill for the user,
 * left-aligned grey for the Director — with the name `sr-only`. That leaves a sighted reader
 * decoding two fills, and a transcript whose only message is a single filled bubble says nothing at
 * all about who is speaking. The name is visible now, in the micro step so it labels the message
 * rather than competing with it, and inherits the bubble's own text colour at reduced opacity
 * because the user bubble inverts.
 */
const AUTHOR_LABEL: Record<ChatMessageRole, string> = {
	assistant: 'Director',
	system: 'System',
	user: 'You',
};

/**
 * The system bubble was filled — first amber, the tone reserved for "needs attention", then teal,
 * the accent. Either way routine transcript scaffolding took a full colour field beside the
 * Director's own replies and differed from them by fill alone. A system note is an aside: it takes
 * a dashed outline and no fill, which is the one treatment on the surface that is not a bubble.
 */
const ROLE_CLASS: Record<ChatMessageRole, string> = {
	assistant: 'max-w-[88%] bg-muted text-foreground',
	system: 'max-w-[88%] border border-dashed border-border text-muted-foreground',
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
			<div className={cn(microLabelClass, 'mb-1 opacity-70')}>{AUTHOR_LABEL[role]}</div>
			<div className="break-words whitespace-pre-wrap">{content}</div>
			{children}
		</div>
	);
}

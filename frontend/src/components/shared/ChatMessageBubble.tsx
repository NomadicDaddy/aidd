import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { microLabelClass, proseMeasureClass } from '../../lib/typography.ts';

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
 *
 * `w-fit` is what makes a bubble a bubble. These are block-level `div`s, so a percentage cap was
 * the only width rule and every message rendered at exactly that cap whatever it held: measured in
 * a 703px transcript at 2250x1309, "hello?" came out 557px wide and a one-line "DIRECTOR_CHAT_OK"
 * came out 598px. A column of identical slabs is a column in which the alignment that is supposed
 * to say who is speaking says nothing, and a two-word reply reads as a paragraph.
 *
 * The cap itself is the declared reading measure rather than a percentage, because a percentage
 * keeps growing with the panel and the panel is unbounded — at 2250 the same 88% that is sensible
 * in a half-page card is most of the screen. `max-w-[46ch]` is 68 characters here for the reason
 * `proseMeasureClass` documents, and it lands on the element that sets `text-sm`, which is where
 * the unit has to be read from. The bubble's own `px-3` comes out of that allowance — 24px, about
 * four characters — which is close enough to leave alone at this size; the correction only earns
 * its keep on a card with `p-7`, which is why `proseMeasureCardClass` exists and this does not use
 * it. `ml-auto` still right-aligns the user role, and now has something narrower to align.
 */
const ROLE_CLASS: Record<ChatMessageRole, string> = {
	assistant: `w-fit ${proseMeasureClass} bg-muted text-foreground`,
	system: `w-fit ${proseMeasureClass} border border-dashed border-border text-muted-foreground`,
	user: `ml-auto w-fit ${proseMeasureClass} bg-foreground text-background`,
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

import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { microLabelClass, proseMeasureClass } from '../../lib/typography.ts';
import { MarkdownContent } from './MarkdownContent.tsx';

/** Who wrote a Director chat message. */
export type ChatMessageRole = 'assistant' | 'system' | 'user';

/**
 * Author names, printed above the message body.
 *
 * The bubbles carried their author only in geometry — right-aligned dark fill for the user,
 * left-aligned grey for the Director — with the name `sr-only`. That leaves a sighted reader
 * decoding two fills, and a transcript whose only message is a single filled bubble says nothing at
 * all about who is speaking. The name is visible now, in the micro step so it labels the message
 * rather than competing with it. Its quieter colour is role-specific: applying opacity to the
 * whole label compounded with the system bubble's already-muted foreground and pushed that label
 * below the contrast floor.
 */
const AUTHOR_LABEL: Record<ChatMessageRole, string> = {
	assistant: 'Director',
	system: 'System',
	user: 'You',
};

/** Author-label tones that stay subordinate without weakening an already-muted role colour. */
const AUTHOR_LABEL_CLASS: Record<ChatMessageRole, string> = {
	assistant: 'text-foreground/70',
	system: 'text-muted-foreground',
	user: 'text-foreground/70',
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
 * User prose keeps the declared reading measure rather than a percentage, because a percentage
 * keeps growing with the panel. Generated replies have a different widest content type: their
 * tables need the transcript width, so assistant and system bubbles use `max-w-full` and let the
 * table's own local scroller contain anything wider. `ml-auto` still right-aligns the user role,
 * and its `proseMeasureClass` cap gives that alignment something narrower to align.
 */
const ROLE_CLASS: Record<ChatMessageRole, string> = {
	assistant: 'w-fit max-w-full bg-muted text-foreground',
	system: 'w-fit max-w-full border border-dashed border-border text-muted-foreground',
	user: `ml-auto w-fit ${proseMeasureClass} bg-muted text-foreground`,
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
	contentClassName,
	pending = false,
	role,
}: {
	children?: ReactNode;
	className?: string;
	content: string;
	contentClassName?: string | undefined;
	pending?: boolean;
	role: ChatMessageRole;
}) {
	return (
		<div
			className={cn(
				'rounded-md px-3 py-2 text-sm',
				ROLE_CLASS[role],
				pending && 'bg-muted text-muted-foreground',
				className,
			)}>
			<div
				className={cn(
					microLabelClass,
					'mb-1',
					AUTHOR_LABEL_CLASS[role],
					pending && 'text-muted-foreground',
				)}>
				{AUTHOR_LABEL[role]}
			</div>
			{role === 'user' ? (
				<div className={cn('break-words whitespace-pre-wrap', contentClassName)}>
					{content}
				</div>
			) : (
				<MarkdownContent
					baseLevel={4}
					markdown={content}
					measure="prose"
					{...(contentClassName ? { className: contentClassName } : {})}
				/>
			)}
			{children}
		</div>
	);
}

/** The optimistic user turn and request state shared by both Director chat surfaces. */
export function PendingChatMessage({ content }: { content: string }) {
	return (
		<>
			<ChatMessageBubble content={content} pending role="user" />
			<p className="text-xs text-muted-foreground">Director is thinking…</p>
		</>
	);
}

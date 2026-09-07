import { useEffect, useRef } from 'react';

/** Keep the active Director conversation pinned to its newest persisted or optimistic message. */
export function usePinnedChatTranscript({
	active = true,
	conversationId,
	messageCount,
	pendingContent,
}: {
	active?: boolean;
	conversationId: string | undefined;
	messageCount: number;
	pendingContent: null | string;
}) {
	const transcriptRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!active) return;
		const transcript = transcriptRef.current;
		if (!transcript) return;

		const pin = () => transcript.scrollTo({ top: transcript.scrollHeight });
		pin();
		const observer = new ResizeObserver(pin);
		observer.observe(transcript);
		const frame = window.requestAnimationFrame(pin);
		return () => {
			observer.disconnect();
			window.cancelAnimationFrame(frame);
		};
	}, [active, conversationId, messageCount, pendingContent]);

	return transcriptRef;
}

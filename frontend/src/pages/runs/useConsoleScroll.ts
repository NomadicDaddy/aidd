import { useCallback, useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Keep a streaming transcript scrolled to the newest output while the operator stays pinned to the
 * bottom, and stop following the moment they scroll away.
 *
 * `followOn` is whatever should re-trigger the follow — new output, a view or wrap change. The
 * pinned flag is mirrored in a ref so the follow effect can read it without re-running on every
 * pin/unpin toggle, which would otherwise fight an in-flight jump animation.
 */
export function useConsoleScroll(consoleOpen: boolean, followOn: unknown[]) {
	const [pinnedToBottom, setPinnedToBottom] = useState(true);
	const scrollRef = useRef<HTMLDivElement>(null);
	const pinnedRef = useRef(true);
	// True while a programmatic jump-to-bottom is animating, so the scroll handler ignores the
	// intermediate positions of that animation instead of treating them as the operator scrolling
	// up and unpinning.
	const programmaticRef = useRef(false);

	function setPinned(value: boolean): void {
		pinnedRef.current = value;
		setPinnedToBottom(value);
	}

	// Plain scrollTop (instant, no animation) so streaming output does not fight a running scroll
	// animation and so there is nothing to suppress for prefers-reduced-motion; the explicit jump
	// below uses smooth.
	useEffect(() => {
		if (!consoleOpen || !pinnedRef.current) return;
		const node = scrollRef.current;
		if (!node) return;
		node.scrollTop = node.scrollHeight;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [consoleOpen, ...followOn]);

	// The follow effect above only fires on new output, so a container that changes size while the
	// operator is pinned leaves them stranded mid-transcript. At a fixed height that never
	// happened; at viewport height a window resize, the sidebar collapse animation, or the
	// terminal pane opening all change clientHeight without producing any new output.
	useEffect(() => {
		const node = scrollRef.current;
		if (!consoleOpen || !node) return;
		const observer = new ResizeObserver(() => {
			if (!pinnedRef.current) return;
			node.scrollTop = node.scrollHeight;
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [consoleOpen]);

	function handleScroll(): void {
		const node = scrollRef.current;
		if (!node) return;
		const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight <= 24;
		if (programmaticRef.current) {
			// Ignore the animation's intermediate frames; only release the guard once it lands.
			if (atBottom) {
				programmaticRef.current = false;
				setPinned(true);
			}
			return;
		}
		setPinned(atBottom);
	}

	function jumpToLatest(): void {
		const node = scrollRef.current;
		if (!node) return;
		programmaticRef.current = true;
		setPinned(true);
		node.scrollTo({
			behavior: prefersReducedMotion() ? 'auto' : 'smooth',
			top: node.scrollHeight,
		});
		// Safety release in case the animation is interrupted (e.g. content grows mid-scroll) and the
		// at-bottom frame never fires, which would otherwise leave the operator unable to unpin.
		window.setTimeout(() => {
			programmaticRef.current = false;
		}, 700);
	}

	/**
	 * Re-pin after switching runs: scroll position is per-run state, not a persistent preference.
	 * Stable across renders so callers can list it as an effect dependency without the effect
	 * re-running on every frame.
	 */
	const resetPin = useCallback((): void => {
		programmaticRef.current = false;
		pinnedRef.current = true;
		setPinnedToBottom(true);
	}, []);

	return { handleScroll, jumpToLatest, pinnedToBottom, resetPin, scrollRef };
}

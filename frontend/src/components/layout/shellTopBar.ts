/**
 * The custom property the shell publishes its in-flow top-bar height on.
 *
 * Below `sm` the navigation `aside` is a `sticky top-0` bar in normal flow, so anything else that
 * sticks to the top of the viewport lands underneath it — and loses, because the bar is `z-20`.
 * Nothing inside `main` can know that height: the bar wraps its own controls, so it is 0px at desk
 * width and roughly 125px on a phone, and it changes again whenever a control is added to it.
 *
 * The value is `0px` whenever the bar is out of flow, which is what `sm:fixed` makes it. A consumer
 * can therefore write `top-[var(--app-topbar-height,0px)]` once and get the right answer at every
 * width, instead of pairing an offset with an `sm:` override that has to be kept in step with the
 * breakpoint the shell actually uses.
 */
export const shellTopBarHeightVar = '--app-topbar-height';

/**
 * Ref callback for the shell's navigation `aside`: keeps {@link shellTopBarHeightVar} current.
 *
 * Returns a cleanup, which React 19 calls when the node detaches — so the property never outlives
 * the element it describes and a stale offset cannot be left behind on the document element.
 */
export function observeShellTopBar(node: HTMLElement): () => void {
	const publish = () => {
		// `fixed` is the `sm:` rail: it is out of flow, so it displaces nothing and offsets nothing.
		const inFlow = getComputedStyle(node).position !== 'fixed';
		document.documentElement.style.setProperty(
			shellTopBarHeightVar,
			inFlow ? `${node.offsetHeight}px` : '0px',
		);
	};

	publish();
	const observer = new ResizeObserver(publish);
	observer.observe(node);
	return () => {
		observer.disconnect();
		document.documentElement.style.removeProperty(shellTopBarHeightVar);
	};
}

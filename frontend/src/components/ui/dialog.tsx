/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect */
import {
	type ComponentProps,
	createContext,
	type KeyboardEvent,
	type ReactNode,
	type RefObject,
	use,
	useEffect,
	useId,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';

import { acquireAppShellInert } from '../../lib/appShellInert.ts';
import { cn } from '../../lib/cn.ts';
import { nextFocusIndex } from '../layout/modal-focus.ts';
import { useDialogStackLayer } from './dialogStack.ts';

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'textarea:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
].join(',');

const DIALOG_MOTION_MS = 150;
const DIALOG_ROOT_Z_INDEX = 100;
type DialogMotionState = 'closed' | 'open';
const DialogDepthContext = createContext(0);
const DialogMotionContext = createContext<DialogMotionState>('open');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
	const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
	return nodes.filter(
		(node) =>
			!node.hasAttribute('disabled') &&
			node.getAttribute('aria-hidden') !== 'true' &&
			node.tabIndex !== -1 &&
			(node.offsetWidth > 0 || node.offsetHeight > 0 || node.getClientRects().length > 0),
	);
}

interface DialogProps {
	/** Element id of the dialog description for `aria-describedby`. */
	'aria-describedby'?: string | undefined;
	/** Element id of the dialog title for `aria-labelledby`. */
	'aria-labelledby'?: string | undefined;
	children: ReactNode;
	/** Where to place focus on open. Falls back to the dialog container. */
	initialFocus?: 'container' | 'first' | 'last';
	/** Explicit primary task control to focus before applying the positional fallback. */
	initialFocusRef?: RefObject<HTMLElement | null>;
	/**
	 * Lock body scroll while open. On by default: a modal that lets the page move behind it is
	 * reporting that it did not take the interaction. Pass `false` only for a surface that genuinely
	 * needs the background to scroll, and say why at the call site.
	 */
	lockScroll?: boolean;
	onClose: () => void;
	open: boolean;
	overlayClassName?: string;
	/** `alertdialog` for confirmations; `dialog` for content modals. */
	role?: 'alertdialog' | 'dialog';
}

const OVERLAY_BASE =
	'fixed inset-0 flex items-center justify-center overflow-y-auto overscroll-contain bg-[var(--overlay)] px-4 py-6 opacity-100 backdrop-blur-sm transition-opacity duration-150 ease-out data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0 motion-reduce:transition-none';
const NESTED_OVERLAY = 'bg-transparent backdrop-blur-none';

/**
 * Canonical modal dialog primitive.
 *
 * Owns every cross-cutting modal concern so consumers only supply panel markup:
 * portals to `document.body`, traps Tab/Shift+Tab focus inside the overlay,
 * closes on Escape and backdrop click, disables the app shell through the shared
 * ref-counted {@link acquireAppShellInert} helper, and restores focus to the
 * triggering element on close. Inactive dialogs render nothing.
 */
export function Dialog({
	'aria-describedby': describedBy,
	'aria-labelledby': labelledBy,
	children,
	initialFocus = 'first',
	initialFocusRef,
	lockScroll = true,
	onClose,
	open,
	overlayClassName,
	role = 'dialog',
}: DialogProps) {
	const inheritedDepth = use(DialogDepthContext);
	const dialogId = useId();
	const [motionState, setMotionState] = useState<DialogMotionState>('closed');
	const [present, setPresent] = useState(open);
	const stackLayer = useDialogStackLayer(dialogId, open, present, inheritedDepth === 0);
	const dialogDepth = inheritedDepth > 0 ? inheritedDepth : stackLayer.depth;
	const ownsScrim = inheritedDepth === 0 && stackLayer.ownsScrim;
	const overlayRef = useRef<HTMLDivElement | null>(null);
	const triggerRef = useRef<HTMLElement | null>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		if (open) {
			setPresent(true);
			const frame = window.requestAnimationFrame(() => setMotionState('open'));
			return () => window.cancelAnimationFrame(frame);
		}

		setMotionState('closed');
		if (!present) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			setPresent(false);
			return;
		}

		const timeout = window.setTimeout(() => setPresent(false), DIALOG_MOTION_MS);
		return () => window.clearTimeout(timeout);
	}, [open, present]);

	useEffect(() => {
		if (!present || typeof document === 'undefined') return;

		triggerRef.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;

		const releaseInert = acquireAppShellInert();
		const previousOverflow = lockScroll ? document.body.style.overflow : null;
		const previousPaddingRight = lockScroll ? document.body.style.paddingRight : null;
		if (lockScroll) {
			// Locking reflows the page: removing the viewport scrollbar hands its width back to the
			// layout, and everything jumps right the instant a dialog opens. Reserving the gutter is
			// the answer to that, not leaving the page scrollable under a modal — which on a touch
			// device is the whole defect, since the finger that meant to scroll the dialog scrolls
			// the page behind it and the dialog reads as unresponsive. Measured rather than assumed:
			// it is 0 on overlay-scrollbar platforms, including every phone.
			const gutter = window.innerWidth - document.documentElement.clientWidth;
			document.body.style.overflow = 'hidden';
			if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;
		}

		const overlay = overlayRef.current;
		const focusables = overlay ? getFocusableElements(overlay) : [];
		const target =
			initialFocusRef?.current ??
			(initialFocus === 'container'
				? overlay
				: initialFocus === 'last'
					? (focusables[focusables.length - 1] ?? overlay)
					: (focusables[0] ?? overlay));
		target?.focus();

		return () => {
			releaseInert();
			if (lockScroll && previousOverflow !== null) {
				// Restored to what this dialog found, not to the empty string: a dialog opened from
				// inside another one finds `hidden` and has to leave it that way. `overflow: hidden`
				// on the body keeps the scroll offset, so closing lands where opening left off.
				document.body.style.overflow = previousOverflow;
				document.body.style.paddingRight = previousPaddingRight ?? '';
			}
			const trigger = triggerRef.current;
			if (trigger && document.contains(trigger)) trigger.focus();
		};
	}, [present, initialFocus, initialFocusRef, lockScroll]);

	if (!present) return null;

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onCloseRef.current();
			return;
		}
		if (event.key !== 'Tab') return;

		const overlay = overlayRef.current;
		if (!overlay) return;
		const focusables = getFocusableElements(overlay);
		if (focusables.length === 0) {
			event.preventDefault();
			return;
		}
		const currentIndex = focusables.findIndex((node) => node === document.activeElement);
		const next = focusables[nextFocusIndex(focusables.length, currentIndex, event.shiftKey)];
		if (next) {
			event.preventDefault();
			next.focus();
		}
	};

	const overlay = (
		<div
			aria-describedby={describedBy}
			aria-labelledby={labelledBy}
			aria-modal="true"
			className={cn(OVERLAY_BASE, ownsScrim ? null : NESTED_OVERLAY, overlayClassName)}
			data-dialog-depth={dialogDepth}
			data-state={motionState}
			onKeyDown={onKeyDown}
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
			ref={overlayRef}
			role={role}
			style={{ zIndex: DIALOG_ROOT_Z_INDEX + dialogDepth }}
			tabIndex={-1}>
			<DialogDepthContext value={dialogDepth + 1}>
				<DialogMotionContext value={motionState}>{children}</DialogMotionContext>
			</DialogDepthContext>
		</div>
	);

	return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
}

const PANEL_BASE =
	'max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-xl border border-border bg-card/95 opacity-100 shadow-2xl ring-1 shadow-black/20 ring-ring/10 backdrop-blur-xl transition-[opacity,transform] duration-150 ease-out data-[state=closed]:translate-y-1 data-[state=closed]:scale-[0.98] data-[state=closed]:opacity-0 motion-reduce:transition-none';

/**
 * Styled dialog panel surface. Stops `mousedown` propagation so clicks inside
 * the panel never trigger the overlay's backdrop-close. Render as a `<form>`
 * with the `as="form"` shape by passing `onSubmit` via a nested element if
 * needed; by default it is a `<div>`.
 */
export function DialogPanel({ children, className, ...props }: ComponentProps<'div'>) {
	const motionState = use(DialogMotionContext);
	return (
		<div
			className={cn(PANEL_BASE, className)}
			data-state={motionState}
			onMouseDown={(event) => event.stopPropagation()}
			{...props}>
			{children}
		</div>
	);
}

/** Scrollable dialog content between a fixed header and footer. */
export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div
			className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)}
			{...props}
		/>
	);
}

/** Dedicated action row. Dismiss actions precede the final commit action. */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				'flex flex-none flex-col-reverse gap-2 sm:flex-row sm:justify-end',
				className,
			)}
			{...props}
		/>
	);
}

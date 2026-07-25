/* eslint-disable react-hooks/refs */
import { type ComponentProps, type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { acquireAppShellInert } from '../../lib/appShellInert.ts';
import { cn } from '../../lib/cn.ts';
import { nextFocusIndex } from '../layout/modal-focus.ts';

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'textarea:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
].join(',');

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
	/** Lock body scroll while open (off by default to preserve scrollbar layout). */
	lockScroll?: boolean;
	onClose: () => void;
	open: boolean;
	overlayClassName?: string;
	/** `alertdialog` for confirmations; `dialog` for content modals. */
	role?: 'alertdialog' | 'dialog';
}

const OVERLAY_BASE =
	'fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm';

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
	lockScroll = false,
	onClose,
	open,
	overlayClassName,
	role = 'dialog',
}: DialogProps) {
	const overlayRef = useRef<HTMLDivElement | null>(null);
	const triggerRef = useRef<HTMLElement | null>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		if (!open || typeof document === 'undefined') return;

		triggerRef.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;

		const releaseInert = acquireAppShellInert();
		const previousOverflow = lockScroll ? document.body.style.overflow : null;
		if (lockScroll) document.body.style.overflow = 'hidden';

		const overlay = overlayRef.current;
		const focusables = overlay ? getFocusableElements(overlay) : [];
		const target =
			initialFocus === 'container'
				? overlay
				: initialFocus === 'last'
					? (focusables[focusables.length - 1] ?? overlay)
					: (focusables[0] ?? overlay);
		target?.focus();

		return () => {
			releaseInert();
			if (lockScroll && previousOverflow !== null) {
				document.body.style.overflow = previousOverflow;
			}
			const trigger = triggerRef.current;
			if (trigger && document.contains(trigger)) trigger.focus();
		};
	}, [open, initialFocus, lockScroll]);

	if (!open) return null;

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
			className={cn(OVERLAY_BASE, overlayClassName)}
			onKeyDown={onKeyDown}
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
			ref={overlayRef}
			role={role}
			tabIndex={-1}>
			{children}
		</div>
	);

	return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
}

const PANEL_BASE =
	'rounded-lg border border-neutral-200 bg-white shadow-2xl ring-1 shadow-teal-950/20 ring-teal-400/10 dark:border-teal-900/70 dark:bg-slate-950';

/**
 * Styled dialog panel surface. Stops `mousedown` propagation so clicks inside
 * the panel never trigger the overlay's backdrop-close. Render as a `<form>`
 * with the `as="form"` shape by passing `onSubmit` via a nested element if
 * needed; by default it is a `<div>`.
 */
export function DialogPanel({ children, className, ...props }: ComponentProps<'div'>) {
	return (
		<div
			className={cn(PANEL_BASE, className)}
			onMouseDown={(event) => event.stopPropagation()}
			{...props}>
			{children}
		</div>
	);
}

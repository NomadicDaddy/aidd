import type {
	CSSProperties,
	ReactElement,
	FocusEvent as ReactFocusEvent,
	KeyboardEvent as ReactKeyboardEvent,
	MouseEvent as ReactMouseEvent,
	ReactNode,
} from 'react';

import {
	cloneElement,
	isValidElement,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';

import type { TooltipAnchorRect, TooltipPlacement, TooltipSide } from './tooltipPlacement.ts';

import { cn } from '../../lib/cn.ts';
import { resolveTooltipPlacement } from './tooltipPlacement.ts';

interface TooltipTriggerInjectedProps {
	'aria-describedby'?: string | undefined;
	onBlur: (event: ReactFocusEvent<HTMLElement>) => void;
	onClick: (event: ReactMouseEvent<HTMLElement>) => void;
	onFocus: (event: ReactFocusEvent<HTMLElement>) => void;
	onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
	onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => void;
	onMouseLeave: (event: ReactMouseEvent<HTMLElement>) => void;
	tabIndex?: number | undefined;
}

interface TooltipProps {
	children: ReactElement<Partial<TooltipTriggerInjectedProps>>;
	className?: string;
	content: ReactNode;
	side?: TooltipSide;
}

function anchorRectFor(element: HTMLElement): TooltipAnchorRect {
	const rect = element.getBoundingClientRect();
	return { bottom: rect.bottom, left: rect.left, top: rect.top, width: rect.width };
}

// Below by default. Opening upward put the panel over whatever the trigger sat beneath — on the
// Badge Lab it covered the specimen's own heading, on the one page that exists to show specimens.
// `resolveTooltipPlacement` still flips to the other side when this one would clip the viewport.
export function Tooltip({ children, className, content, side = 'bottom' }: TooltipProps) {
	const [open, setOpen] = useState(false);
	const [anchor, setAnchor] = useState<null | TooltipAnchorRect>(null);
	const [placement, setPlacement] = useState<null | TooltipPlacement>(null);
	const wrapperRef = useRef<HTMLSpanElement | null>(null);
	const tooltipRef = useRef<HTMLSpanElement | null>(null);
	const tooltipId = useId();

	const showForElement = (element: HTMLElement) => {
		setAnchor(anchorRectFor(element));
		setOpen(true);
	};
	const handleHide = () => {
		setOpen(false);
		setAnchor(null);
		setPlacement(null);
	};

	useEffect(() => {
		if (!open) return;
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') handleHide();
		};
		const handlePointer = (event: PointerEvent) => {
			const target = event.target;
			if (target instanceof Node && wrapperRef.current?.contains(target)) return;
			handleHide();
		};
		document.addEventListener('keydown', handleKey);
		document.addEventListener('pointerdown', handlePointer);
		return () => {
			document.removeEventListener('keydown', handleKey);
			document.removeEventListener('pointerdown', handlePointer);
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;

		const updateAnchor = () => {
			const element = wrapperRef.current;
			if (!element) return;
			setAnchor(anchorRectFor(element));
		};

		window.addEventListener('resize', updateAnchor);
		window.addEventListener('scroll', updateAnchor, true);
		return () => {
			window.removeEventListener('resize', updateAnchor);
			window.removeEventListener('scroll', updateAnchor, true);
		};
	}, [open]);

	// The tooltip renders hidden at the anchor first so its real size can be
	// measured here; placement (flip + viewport clamp) then lands before paint.
	useLayoutEffect(() => {
		if (!open || !anchor) return;
		const tooltip = tooltipRef.current;
		if (!tooltip) return;
		const { height, width } = tooltip.getBoundingClientRect();
		const next = resolveTooltipPlacement(
			anchor,
			{ height, width },
			{ height: window.innerHeight, width: window.innerWidth },
			side,
		);
		setPlacement((current) =>
			current &&
			current.left === next.left &&
			current.side === next.side &&
			current.top === next.top
				? current
				: next,
		);
	}, [open, anchor, side, content]);

	if (!isValidElement(content) && (content === null || content === undefined || content === '')) {
		return children;
	}

	const triggerProps = children.props;
	const injected: TooltipTriggerInjectedProps = {
		'aria-describedby': open ? tooltipId : undefined,
		onBlur: (event) => {
			triggerProps.onBlur?.(event);
			handleHide();
		},
		onClick: (event) => {
			triggerProps.onClick?.(event);
			showForElement(event.currentTarget);
		},
		onFocus: (event) => {
			triggerProps.onFocus?.(event);
			showForElement(event.currentTarget);
		},
		onKeyDown: (event) => {
			triggerProps.onKeyDown?.(event);
			if (event.key === 'Escape' && open) {
				event.stopPropagation();
				handleHide();
			}
		},
		onMouseEnter: (event) => {
			triggerProps.onMouseEnter?.(event);
			showForElement(event.currentTarget);
		},
		onMouseLeave: (event) => {
			triggerProps.onMouseLeave?.(event);
			handleHide();
		},
		tabIndex: triggerProps.tabIndex ?? 0,
	};
	const trigger = cloneElement(children, injected);

	const tooltipStyle: CSSProperties = placement
		? { left: placement.left, top: placement.top }
		: { left: anchor?.left ?? 0, top: anchor?.top ?? 0, visibility: 'hidden' };

	return (
		// `max-w-full min-w-0`, because this wrapper has to be transparent to sizing. A trigger that
		// declares its own `max-w-full min-w-0` — `ExecutionIdentityBadges` does — resolves that
		// against the wrapper rather than against the cell, so wrapping it in a rigid shell silently
		// revokes its ability to shrink. On Project Detail the identity badge needed 226px in a 219px
		// cell and spilled out of the card instead of head-truncating the model as designed. Neither
		// class does anything to a wrapper whose content already fits.
		<span className="relative inline-flex max-w-full min-w-0" ref={wrapperRef}>
			{trigger}
			{open && anchor
				? createPortal(
						<span
							className={cn(
								// The panel was built from raw palette literals plus hand-written dark:
								// overrides, which computed to a chroma-zero grey against the app's
								// cool-slate cards — the one overlay that visibly did not belong to
								// the page. The overlay tokens theme-swap on their own, so the dark:
								// pairs and the forbidden shadow both go.
								'pointer-events-none fixed z-[1000] w-max max-w-xs rounded-md border border-border bg-overlay px-2 py-1 text-xs whitespace-pre-line text-foreground',
								className,
							)}
							id={tooltipId}
							ref={tooltipRef}
							role="tooltip"
							style={tooltipStyle}>
							{content}
						</span>,
						document.body,
					)
				: null}
		</span>
	);
}

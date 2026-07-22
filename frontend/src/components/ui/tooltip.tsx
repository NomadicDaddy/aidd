import type {
	CSSProperties,
	FocusEvent as ReactFocusEvent,
	KeyboardEvent as ReactKeyboardEvent,
	MouseEvent as ReactMouseEvent,
	ReactElement,
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

export function Tooltip({ children, className, content, side = 'top' }: TooltipProps) {
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
			side
		);
		setPlacement((current) =>
			current &&
			current.left === next.left &&
			current.side === next.side &&
			current.top === next.top
				? current
				: next
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
		<span className="relative inline-flex" ref={wrapperRef}>
			{trigger}
			{open && anchor
				? createPortal(
						<span
							className={cn(
								'pointer-events-none fixed z-[1000] w-max max-w-xs rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs whitespace-pre-line text-neutral-700 shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100',
								className
							)}
							id={tooltipId}
							ref={tooltipRef}
							role="tooltip"
							style={tooltipStyle}>
							{content}
						</span>,
						document.body
					)
				: null}
		</span>
	);
}

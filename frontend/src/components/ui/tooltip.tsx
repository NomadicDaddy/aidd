import type { CSSProperties } from 'react';

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

import type { TooltipAnchorRect, TooltipPlacement } from './tooltipPlacement.ts';
import type { TooltipProps, TooltipTriggerInjectedProps } from './tooltipTypes.ts';

import { cn } from '../../lib/cn.ts';
import { controlFocusClass } from '../../lib/formStyles.ts';
import { disabledTooltipLabel } from './tooltipLabel.ts';
import { isTooltipAnchorVisible, resolveTooltipPlacement } from './tooltipPlacement.ts';

function anchorRectFor(element: HTMLElement): TooltipAnchorRect {
	const rect = element.getBoundingClientRect();
	return { bottom: rect.bottom, left: rect.left, top: rect.top, width: rect.width };
}

function clippingRectsFor(element: HTMLElement) {
	const rects: DOMRect[] = [];
	let ancestor = element.parentElement;
	while (ancestor) {
		const style = window.getComputedStyle(ancestor);
		if (
			`${style.overflow} ${style.overflowX} ${style.overflowY}`.match(
				/auto|clip|hidden|scroll/u,
			)
		) {
			rects.push(ancestor.getBoundingClientRect());
		}
		ancestor = ancestor.parentElement;
	}
	return rects;
}

export function Tooltip({
	children,
	className,
	content,
	disclosure = false,
	disclosureLabel,
	maxWidth = 'xs',
	side = 'bottom',
	touchAlignment = 'center',
	touchTargetMode = 'flow',
}: TooltipProps) {
	const [open, setOpen] = useState(false);
	const [anchor, setAnchor] = useState<null | TooltipAnchorRect>(null);
	const [placement, setPlacement] = useState<null | TooltipPlacement>(null);
	const wrapperRef = useRef<HTMLSpanElement | null>(null);
	const tooltipRef = useRef<HTMLDivElement | null>(null);
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
			const nextAnchor = anchorRectFor(element);
			if (
				!isTooltipAnchorVisible(
					nextAnchor,
					{ height: window.innerHeight, width: window.innerWidth },
					clippingRectsFor(element),
				)
			) {
				handleHide();
				return;
			}
			setAnchor(nextAnchor);
		};

		window.addEventListener('resize', updateAnchor);
		window.addEventListener('scroll', updateAnchor, true);
		return () => {
			window.removeEventListener('resize', updateAnchor);
			window.removeEventListener('scroll', updateAnchor, true);
		};
	}, [open]);

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
	const disabledTrigger = triggerProps.disabled === true;
	const wrapperLabel = disabledTrigger ? disabledTooltipLabel(triggerProps, content) : null;
	const wrapperOwnsInteraction = disabledTrigger || disclosure;
	const wrapperIsFocusable = disclosure || wrapperLabel !== null;
	const injected: TooltipTriggerInjectedProps = {
		'aria-describedby': open
			? [triggerProps['aria-describedby'], tooltipId].filter(Boolean).join(' ')
			: triggerProps['aria-describedby'],
		className: cn(triggerProps.className, controlFocusClass, 'focus-visible:outline-none'),
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
	};
	const trigger = wrapperOwnsInteraction ? children : cloneElement(children, injected);

	const designMaxWidth = { sm: '24rem', wide: '32rem', xs: '20rem' }[maxWidth];
	const safeMaxWidth = `min(${designMaxWidth}, calc(100vw - 1rem))`;
	const tooltipStyle: CSSProperties = placement
		? { left: placement.left, maxWidth: safeMaxWidth, top: placement.top }
		: {
				left: anchor?.left ?? 0,
				maxWidth: safeMaxWidth,
				top: anchor?.top ?? 0,
				visibility: 'hidden',
			};

	return (
		<span
			aria-describedby={wrapperOwnsInteraction && open ? tooltipId : undefined}
			aria-disabled={wrapperLabel ? true : undefined}
			aria-label={disclosure ? disclosureLabel : (wrapperLabel ?? undefined)}
			className={cn(
				'relative inline-flex max-w-full min-w-0',
				wrapperIsFocusable &&
					`cursor-help rounded ${controlFocusClass} focus-visible:outline-none`,
				disclosure && 'decoration-dotted underline-offset-2 max-sm:underline',
				disclosure && touchTargetMode === 'flow' && 'max-sm:min-h-11 max-sm:min-w-11',
				disclosure &&
					(touchAlignment === 'start'
						? 'max-sm:items-start max-sm:justify-start'
						: 'max-sm:items-center max-sm:justify-center'),
			)}
			onBlur={wrapperOwnsInteraction ? handleHide : undefined}
			onClick={
				wrapperOwnsInteraction
					? (event) => {
							showForElement(event.currentTarget);
						}
					: undefined
			}
			onFocus={
				wrapperOwnsInteraction
					? (event) => {
							showForElement(event.currentTarget);
						}
					: undefined
			}
			onKeyDown={
				wrapperOwnsInteraction
					? (event) => {
							if (event.key === 'Escape' && open) {
								event.stopPropagation();
								handleHide();
							}
							if (disclosure && (event.key === 'Enter' || event.key === ' ')) {
								event.preventDefault();
								showForElement(event.currentTarget);
							}
						}
					: undefined
			}
			onMouseEnter={
				wrapperOwnsInteraction
					? (event) => {
							showForElement(event.currentTarget);
						}
					: undefined
			}
			onMouseLeave={wrapperOwnsInteraction ? handleHide : undefined}
			ref={wrapperRef}
			role={wrapperIsFocusable ? 'button' : undefined}
			tabIndex={wrapperIsFocusable ? 0 : undefined}>
			{disclosure && touchTargetMode === 'overlay' ? (
				<span aria-hidden="true" className="absolute -inset-x-2 -inset-y-3.5 sm:hidden" />
			) : null}
			{trigger}
			{open && anchor
				? createPortal(
						<div
							className={cn(
								'pointer-events-none fixed z-[1000] block w-max rounded-md border border-control-border bg-card px-2 py-1 text-xs whitespace-pre-line text-foreground shadow-lg',
								className,
							)}
							id={tooltipId}
							ref={tooltipRef}
							role="tooltip"
							style={tooltipStyle}>
							{content}
						</div>,
						document.getElementById('main-content') ?? document.body,
					)
				: null}
		</span>
	);
}

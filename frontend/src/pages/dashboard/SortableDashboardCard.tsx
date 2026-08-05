import type { KeyboardEvent, ReactNode, PointerEvent as ReactPointerEvent } from 'react';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { default as ChevronsLeftRight } from 'lucide-react/dist/esm/icons/chevrons-left-right';
import { default as ChevronsRightLeft } from 'lucide-react/dist/esm/icons/chevrons-right-left';
import { default as GripHorizontal } from 'lucide-react/dist/esm/icons/grip-horizontal';
import { default as GripVertical } from 'lucide-react/dist/esm/icons/grip-vertical';
import { useRef, useState } from 'react';

import { cn } from '../../lib/cn.ts';
import {
	clampCardHeight,
	type DashboardCardId,
	useDashboardStore,
} from '../../stores/dashboardStore.ts';

export interface DashboardCardDef {
	/** Default width before the user customizes it. */
	fullWidth?: boolean;
	id: DashboardCardId;
	label: string;
	node: ReactNode;
}

const KEYBOARD_RESIZE_STEP = 24;

const pillClassName =
	'inline-flex items-center rounded-full border border-accent/50 bg-card px-2 py-0.5 text-accent shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

export function SortableDashboardCard({
	card,
	locked,
}: {
	card: DashboardCardDef;
	locked: boolean;
}) {
	const setCardHeight = useDashboardStore((state) => state.setCardHeight);
	const setCardWidth = useDashboardStore((state) => state.setCardWidth);
	const size = useDashboardStore((state) => state.cardSizes[card.id]);
	const [draftHeight, setDraftHeight] = useState<null | number>(null);
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	const resizeRef = useRef<{ startHeight: number; startY: number } | null>(null);
	const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
		disabled: locked,
		id: card.id,
	});
	const isFull = size?.width ? size.width === 'full' : Boolean(card.fullWidth);
	const height = draftHeight ?? size?.height;
	const WidthIcon = isFull ? ChevronsRightLeft : ChevronsLeftRight;

	function handleResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
		event.preventDefault();
		event.stopPropagation();
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		event.currentTarget.focus();
		event.currentTarget.setPointerCapture(event.pointerId);
		resizeRef.current = { startHeight: wrapper.offsetHeight, startY: event.clientY };
	}

	function handleResizeMove(event: ReactPointerEvent<HTMLButtonElement>) {
		const resize = resizeRef.current;
		if (!resize) return;
		setDraftHeight(clampCardHeight(resize.startHeight + event.clientY - resize.startY));
	}

	function handleResizeEnd(event: ReactPointerEvent<HTMLButtonElement>) {
		const resize = resizeRef.current;
		if (!resize) return;
		resizeRef.current = null;
		const next = clampCardHeight(resize.startHeight + event.clientY - resize.startY);
		setDraftHeight(null);
		if (next !== resize.startHeight) setCardHeight(card.id, next);
	}

	function handleResizeKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		event.preventDefault();
		const current = wrapperRef.current?.offsetHeight;
		if (current === undefined) return;
		const delta = event.key === 'ArrowDown' ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP;
		setCardHeight(card.id, clampCardHeight(current + delta));
	}

	return (
		<div
			className={cn(
				'relative min-w-0 rounded-lg',
				isFull && 'xl:col-span-2',
				!locked &&
					'cursor-grab outline-2 outline-offset-2 outline-accent/60 outline-dashed active:cursor-grabbing',
				isDragging && 'z-10 opacity-60',
			)}
			ref={(node) => {
				setNodeRef(node);
				wrapperRef.current = node;
			}}
			style={{
				height: height === undefined ? undefined : `${height}px`,
				transform: CSS.Transform.toString(transform),
				transition,
			}}
			{...(locked ? {} : listeners)}>
			{!locked && (
				<div className="absolute -top-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1">
					<button
						aria-label={`Reorder ${card.label} card`}
						className={cn(pillClassName, 'cursor-grab active:cursor-grabbing')}
						type="button"
						{...attributes}
						{...listeners}>
						<GripVertical className="h-3.5 w-3.5" />
					</button>
					<button
						aria-label={
							isFull
								? `Set ${card.label} card to half width`
								: `Set ${card.label} card to full width`
						}
						className={cn(pillClassName, 'cursor-pointer')}
						onClick={() => {
							setCardWidth(card.id, isFull ? 'half' : 'full');
						}}
						onPointerDown={(event) => {
							event.stopPropagation();
						}}
						title={isFull ? 'Half width' : 'Full width'}
						type="button">
						<WidthIcon className="h-3.5 w-3.5" />
					</button>
				</div>
			)}
			<div
				className={cn(
					height !== undefined && 'h-full overflow-hidden *:h-full *:overflow-y-auto',
				)}>
				{card.node}
			</div>
			{!locked && (
				<button
					aria-label={`Resize ${card.label} card height`}
					className={cn(
						pillClassName,
						'absolute -bottom-2.5 left-1/2 z-10 -translate-x-1/2 cursor-ns-resize',
					)}
					onDoubleClick={() => {
						setCardHeight(card.id, null);
					}}
					onKeyDown={handleResizeKeyDown}
					onPointerDown={handleResizeStart}
					onPointerMove={handleResizeMove}
					onPointerUp={handleResizeEnd}
					title="Drag or use arrow keys to resize height; double-click to reset"
					type="button">
					<GripHorizontal className="h-3.5 w-3.5" />
				</button>
			)}
		</div>
	);
}

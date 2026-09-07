import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useState } from 'react';

import { type DashboardCardId, useDashboardStore } from '../../stores/dashboardStore.ts';
import { dashboardCardPlacements, orphanedLastCardIndex } from './dashboard-shared.ts';
import { type DashboardCardDef, SortableDashboardCard } from './SortableDashboardCard.tsx';

export type { DashboardCardDef } from './SortableDashboardCard.tsx';

export function SortableDashboardGrid({ cards }: { cards: DashboardCardDef[] }) {
	const cardOrder = useDashboardStore((state) => state.cardOrder);
	const cardSizes = useDashboardStore((state) => state.cardSizes);
	const locked = useDashboardStore((state) => state.locked);
	const setCardOrder = useDashboardStore((state) => state.setCardOrder);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);
	const byId = new Map(cards.map((card) => [card.id, card]));
	const ordered = cardOrder.flatMap((id) => byId.get(id) ?? []);
	const [cardHeights, setCardHeights] = useState<Partial<Record<DashboardCardId, number>>>({});
	const fullWidths = ordered.map((card) => {
		const width = cardSizes[card.id]?.width;
		return width ? width === 'full' : Boolean(card.fullWidth);
	});
	const orphanIndex = orphanedLastCardIndex(fullWidths);
	const measuredHeights = ordered.map((card) => cardHeights[card.id]);
	const layoutReady = measuredHeights.every((height) => height !== undefined);
	const placements = layoutReady
		? dashboardCardPlacements(
				fullWidths,
				ordered.map((card) => cardHeights[card.id] ?? 1),
			)
		: [];
	const cardGapClass = locked ? 'gap-4' : 'gap-x-4 gap-y-6';

	const handleHeightChange = (id: DashboardCardId, height: number) => {
		setCardHeights((current) =>
			current[id] === height ? current : { ...current, [id]: height },
		);
	};

	function handleDragEnd({ active, over }: DragEndEvent) {
		if (!over || active.id === over.id) return;
		setCardOrder(
			arrayMove(
				cardOrder,
				cardOrder.indexOf(active.id as DashboardCardId),
				cardOrder.indexOf(over.id as DashboardCardId),
			),
		);
	}

	return (
		<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
			<SortableContext items={cardOrder} strategy={rectSortingStrategy}>
				{/* Once every card has reported its rendered height, one-pixel rows let the two
				    columns advance independently. Until then this remains the ordinary two-column
				    grid, preventing an overlapping first render. Each card still owns its height. */}
				{/* `page-reveal` so the cards stagger individually. This section is the page's own
				    reveal root's third child, so without it the whole card region would arrive in
				    one 100ms beat while the ladder's last two steps went to the two dnd-kit live
				    regions below — 0px and 1px tall, animating nothing. The nested-reveal rules in
				    index.css suppress this element's own entrance and continue the ladder through
				    its children, which are exactly the cards. */}
				<section
					aria-label="Dashboard cards"
					className={
						layoutReady
							? `page-reveal grid items-start ${cardGapClass} xl:auto-rows-[1px] xl:grid-cols-2 xl:gap-y-0`
							: `page-reveal grid items-start ${cardGapClass} xl:grid-cols-2`
					}>
					{ordered.map((card, index) => (
						<SortableDashboardCard
							card={card}
							key={card.id}
							locked={locked}
							onHeightChange={handleHeightChange}
							stretch={index === orphanIndex}
							{...(placements[index] ? { placement: placements[index] } : {})}
						/>
					))}
				</section>
			</SortableContext>
		</DndContext>
	);
}

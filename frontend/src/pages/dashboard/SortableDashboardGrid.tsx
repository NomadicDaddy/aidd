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

import { type DashboardCardId, useDashboardStore } from '../../stores/dashboardStore.ts';
import { orphanedLastCardIndex } from './dashboard-shared.ts';
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
	const orphanIndex = orphanedLastCardIndex(
		ordered.map((card) => {
			const width = cardSizes[card.id]?.width;
			return width ? width === 'full' : Boolean(card.fullWidth);
		}),
	);

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
				{/* items-start rather than the grid default of stretch. Each card owns its height:
				    a resized card carries an explicit pixel height that still wins here, and an
				    auto-height card sits at its content instead of being pulled taller by whichever
				    unrelated card happens to share its row. No shared cap is imposed. */}
				<section
					aria-label="Dashboard cards"
					className="grid items-start gap-4 xl:grid-cols-2">
					{ordered.map((card, index) => (
						<SortableDashboardCard
							card={card}
							key={card.id}
							locked={locked}
							stretch={index === orphanIndex}
						/>
					))}
				</section>
			</SortableContext>
		</DndContext>
	);
}

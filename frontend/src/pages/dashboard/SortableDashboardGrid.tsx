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
import { type DashboardCardDef, SortableDashboardCard } from './SortableDashboardCard.tsx';

export type { DashboardCardDef } from './SortableDashboardCard.tsx';

export function SortableDashboardGrid({ cards }: { cards: DashboardCardDef[] }) {
	const cardOrder = useDashboardStore((state) => state.cardOrder);
	const locked = useDashboardStore((state) => state.locked);
	const setCardOrder = useDashboardStore((state) => state.setCardOrder);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);
	const byId = new Map(cards.map((card) => [card.id, card]));
	const ordered = cardOrder.flatMap((id) => byId.get(id) ?? []);

	function handleDragEnd({ active, over }: DragEndEvent) {
		if (!over || active.id === over.id) return;
		setCardOrder(
			arrayMove(
				cardOrder,
				cardOrder.indexOf(active.id as DashboardCardId),
				cardOrder.indexOf(over.id as DashboardCardId)
			)
		);
	}

	return (
		<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
			<SortableContext items={cardOrder} strategy={rectSortingStrategy}>
				<section aria-label="Dashboard cards" className="grid gap-4 xl:grid-cols-2">
					{ordered.map((card) => (
						<SortableDashboardCard card={card} key={card.id} locked={locked} />
					))}
				</section>
			</SortableContext>
		</DndContext>
	);
}

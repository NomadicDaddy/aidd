import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

import { listBoxOptionId } from '../../components/ui/listbox.tsx';

/** The measured content width where the catalog and detail become simultaneous panes. */
const SKILLS_SPLIT_MIN_WIDTH = 640;

interface SkillsMasterDetailState {
	backButtonRef: RefObject<HTMLButtonElement | null>;
	catalogHasSelection: boolean;
	clearSelection: () => void;
	selectedId: null | string;
	selectSkill: (id: string) => void;
	showCatalog: (id: string) => void;
	showDetail: boolean;
}

export function useSkillsMasterDetail(
	splitRef: RefObject<HTMLDivElement | null>,
): SkillsMasterDetailState {
	const backButtonRef = useRef<HTMLButtonElement>(null);
	const [selectedId, setSelectedId] = useState<null | string>(null);
	const [showDetail, setShowDetail] = useState(false);
	const [splitLayout, setSplitLayout] = useState(false);

	useLayoutEffect(() => {
		const region = splitRef.current;
		if (!region) return;
		const measuredRegion = region;
		function update(): void {
			setSplitLayout(measuredRegion.offsetWidth >= SKILLS_SPLIT_MIN_WIDTH);
		}
		update();
		const observer = new ResizeObserver(update);
		observer.observe(measuredRegion);
		return () => observer.disconnect();
	}, [splitRef]);

	function clearSelection(): void {
		setSelectedId(null);
	}

	function selectSkill(id: string): void {
		setSelectedId(id);
		const region = splitRef.current;
		if (!region || region.offsetWidth >= SKILLS_SPLIT_MIN_WIDTH) return;
		setShowDetail(true);
		region.scrollIntoView({ block: 'start' });
		requestAnimationFrame(() => backButtonRef.current?.focus({ preventScroll: true }));
	}

	function showCatalog(id: string): void {
		setShowDetail(false);
		requestAnimationFrame(() => {
			const option = document.getElementById(listBoxOptionId('skill', id));
			if (option instanceof HTMLElement) option.focus({ preventScroll: true });
		});
	}

	return {
		backButtonRef,
		catalogHasSelection: showDetail || splitLayout,
		clearSelection,
		selectedId,
		selectSkill,
		showCatalog,
		showDetail,
	};
}

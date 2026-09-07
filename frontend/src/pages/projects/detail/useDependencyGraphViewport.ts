import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

export interface DependencyGraphViewportMetrics {
	clientHeight: number;
	clientWidth: number;
	horizontalPercent: number;
	scrollHeight: number;
	scrollWidth: number;
	verticalPercent: number;
}

const EMPTY_METRICS: DependencyGraphViewportMetrics = {
	clientHeight: 0,
	clientWidth: 0,
	horizontalPercent: 0,
	scrollHeight: 0,
	scrollWidth: 0,
	verticalPercent: 0,
};

function progressPercent(position: number, scrollSize: number, clientSize: number): number {
	const maximum = scrollSize - clientSize;
	return maximum > 0 ? Math.round((position / maximum) * 100) : 0;
}

export function dependencyGraphViewportMetrics(input: {
	clientHeight: number;
	clientWidth: number;
	scrollHeight: number;
	scrollLeft: number;
	scrollTop: number;
	scrollWidth: number;
}): DependencyGraphViewportMetrics {
	return {
		clientHeight: input.clientHeight,
		clientWidth: input.clientWidth,
		horizontalPercent: progressPercent(input.scrollLeft, input.scrollWidth, input.clientWidth),
		scrollHeight: input.scrollHeight,
		scrollWidth: input.scrollWidth,
		verticalPercent: progressPercent(input.scrollTop, input.scrollHeight, input.clientHeight),
	};
}

function sameMetrics(
	left: DependencyGraphViewportMetrics,
	right: DependencyGraphViewportMetrics,
): boolean {
	return (
		left.clientHeight === right.clientHeight &&
		left.clientWidth === right.clientWidth &&
		left.horizontalPercent === right.horizontalPercent &&
		left.scrollHeight === right.scrollHeight &&
		left.scrollWidth === right.scrollWidth &&
		left.verticalPercent === right.verticalPercent
	);
}

export function useDependencyGraphViewport(refreshKey?: unknown): {
	metrics: DependencyGraphViewportMetrics;
	ref: RefObject<HTMLDivElement | null>;
	scrollToHorizontalPercent: (percent: number) => void;
	scrollToVerticalPercent: (percent: number) => void;
	width: number | undefined;
} {
	const ref = useRef<HTMLDivElement | null>(null);
	const [metrics, setMetrics] = useState(EMPTY_METRICS);

	useLayoutEffect(() => {
		const node = ref.current;
		if (!node) return;
		const scroller = node;
		function measure(): void {
			const next = dependencyGraphViewportMetrics(scroller);
			setMetrics((current) => (sameMetrics(current, next) ? current : next));
		}
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(scroller);
		if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
		scroller.addEventListener('scroll', measure, { passive: true });
		return () => {
			scroller.removeEventListener('scroll', measure);
			observer.disconnect();
		};
	}, [refreshKey]);

	function scrollToPercent(axis: 'horizontal' | 'vertical', percent: number): void {
		const node = ref.current;
		if (!node) return;
		const normalized = Math.min(100, Math.max(0, percent)) / 100;
		if (axis === 'horizontal') {
			node.scrollLeft = (node.scrollWidth - node.clientWidth) * normalized;
		} else {
			node.scrollTop = (node.scrollHeight - node.clientHeight) * normalized;
		}
	}

	return {
		metrics,
		ref,
		scrollToHorizontalPercent: (percent) => scrollToPercent('horizontal', percent),
		scrollToVerticalPercent: (percent) => scrollToPercent('vertical', percent),
		width: metrics.clientWidth || undefined,
	};
}

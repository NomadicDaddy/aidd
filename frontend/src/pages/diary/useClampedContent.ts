import { useEffect, useRef, useState } from 'react';

export function useClampedContent(expanded: boolean, value: string) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [clamped, setClamped] = useState(false);

	useEffect(() => {
		if (expanded) return;
		const content = containerRef.current?.firstElementChild;
		if (!(content instanceof HTMLElement)) return;

		const measure = () => setClamped(content.scrollHeight - content.clientHeight > 1);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(content);
		return () => observer.disconnect();
	}, [expanded, value]);

	return { clamped, containerRef };
}

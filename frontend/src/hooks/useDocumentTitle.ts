import { useEffect } from 'react';

const SUFFIX = 'aidd';

export function useDocumentTitle(title: string | undefined): void {
	useEffect(() => {
		const previous = document.title;
		const segments = title
			? title
					.split(' · ')
					.map((segment) => segment.trim())
					.filter((segment) => segment.length > 0)
			: [];
		const next =
			segments.length === 0
				? SUFFIX
				: segments.includes(SUFFIX)
					? segments.join(' · ')
					: `${segments.join(' · ')} · ${SUFFIX}`;
		document.title = next;
		return () => {
			document.title = previous;
		};
	}, [title]);
}

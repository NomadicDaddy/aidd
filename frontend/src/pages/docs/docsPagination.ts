import { DOC_SECTIONS, DOCS_SIDEBAR_GROUPS, type DocSection } from './docs-manifest.ts';

interface DocsNeighbors {
	next: DocSection | undefined;
	previous: DocSection | undefined;
}

export function docsNeighbors(slug: string): DocsNeighbors {
	const visibleSlugs: ReadonlySet<string> = new Set(
		DOCS_SIDEBAR_GROUPS.flatMap((group) => [...group.slugs]),
	);
	const visibleSections = DOC_SECTIONS.filter((section) => visibleSlugs.has(section.slug));
	const index = visibleSections.findIndex((section) => section.slug === slug);
	if (index === -1) return { next: undefined, previous: undefined };
	return {
		next: visibleSections[index + 1],
		previous: visibleSections[index - 1],
	};
}

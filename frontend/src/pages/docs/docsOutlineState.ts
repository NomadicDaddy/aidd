export interface OutlineHeadingPosition {
	id: string;
	top: number;
}

/** Whether the document has enough sections for an on-page outline to be useful. */
export function shouldRenderDocsOutline(headingCount: number): boolean {
	return headingCount >= 2;
}

/** Select the section owning the viewport's reading position. */
export function activeOutlineHeadingId(
	headings: readonly OutlineHeadingPosition[],
	activationOffset: number,
	documentScrollable: boolean,
): null | string {
	const firstHeading = headings[0];
	if (firstHeading === undefined || !documentScrollable) return null;

	let activeId = firstHeading.id;
	for (const heading of headings) {
		if (heading.top > activationOffset) break;
		activeId = heading.id;
	}
	return activeId;
}

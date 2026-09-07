import type { ReactNode } from 'react';

import type { MarkdownTableAlignment } from '../../lib/markdownTables.ts';

import { cn } from '../../lib/cn.ts';
import { OverflowScroller } from './OverflowScroller.tsx';

const ALIGNMENT_CLASS: Record<Exclude<MarkdownTableAlignment, null>, string> = {
	center: 'text-center',
	left: 'text-left',
	right: 'text-right',
};

function alignmentClass(alignment: MarkdownTableAlignment): string {
	return alignment === null ? ALIGNMENT_CLASS.left : ALIGNMENT_CLASS[alignment];
}

export function MarkdownTable({
	alignments,
	header,
	rows,
}: {
	alignments: MarkdownTableAlignment[];
	header: ReactNode[][];
	rows: ReactNode[][][];
}) {
	return (
		<OverflowScroller ariaLabel="Markdown table" className="rounded-md border border-border">
			<table className="w-max min-w-full border-collapse text-sm">
				<thead className="bg-muted text-foreground">
					<tr>
						{header.map((cell, index) => (
							<th
								className={cn(
									'min-w-32 border-b border-border px-3 py-2 align-bottom font-semibold',
									alignmentClass(alignments[index] ?? null),
								)}
								key={index}
								scope="col">
								{cell}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="divide-y divide-border">
					{rows.map((row, rowIndex) => (
						<tr key={rowIndex}>
							{row.map((cell, cellIndex) => (
								<td
									className={cn(
										'min-w-32 px-3 py-2 align-top text-foreground',
										alignmentClass(alignments[cellIndex] ?? null),
									)}
									key={cellIndex}>
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</OverflowScroller>
	);
}

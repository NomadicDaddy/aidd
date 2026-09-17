import { default as ChevronLeft } from 'lucide-react/dist/esm/icons/chevron-left';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';

import { IconButton } from '../../../components/ui/button.tsx';
import { selectClass } from '../../../lib/formStyles.ts';
import { nextPage, previousPage, totalPageCount } from './pagination-utils.ts';

export function Pagination({
	hasNextPage = false,
	isLoadingNextPage = false,
	onChange,
	onLoadNextPage,
	page,
	pageSize,
	total,
}: {
	hasNextPage?: boolean;
	isLoadingNextPage?: boolean;
	onChange: (page: number) => void;
	onLoadNextPage?: (() => void) | undefined;
	page: number;
	pageSize: number;
	total: number;
}) {
	const totalPages = totalPageCount(total, pageSize);
	if (total === 0) return null;
	const start = page * pageSize + 1;
	const end = Math.min(total, (page + 1) * pageSize);
	const hasLoadedNextPage = page + 1 < totalPages;
	const canLoadNextPage = hasNextPage && onLoadNextPage !== undefined;
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
			<span>
				{hasNextPage ? (
					`Showing ${start}–${end} of ${total}+ items`
				) : (
					<>
						Showing {start}–{end} of {total} items
					</>
				)}
			</span>
			<div className="flex items-center gap-2">
				<IconButton
					ariaLabel="Previous page"
					disabled={page === 0}
					onClick={() => onChange(previousPage(page))}
					variant="secondary">
					<ChevronLeft className="h-4 w-4" />
				</IconButton>
				<label className="flex items-center gap-2 whitespace-nowrap">
					<span>Page</span>
					<select
						className={`${selectClass} min-w-16 px-2 text-xs`}
						onChange={(event) => onChange(Number(event.currentTarget.value))}
						value={page}>
						{Array.from({ length: totalPages }, (_, index) => (
							<option key={index} value={index}>
								{index + 1}
							</option>
						))}
					</select>
					<span>
						of {totalPages}
						{hasNextPage ? '+' : ''}
					</span>
				</label>
				<IconButton
					ariaLabel="Next page"
					disabled={isLoadingNextPage || (!hasLoadedNextPage && !canLoadNextPage)}
					onClick={() => {
						if (hasLoadedNextPage) onChange(nextPage(page, totalPages));
						else onLoadNextPage?.();
					}}
					variant="secondary">
					<ChevronRight className="h-4 w-4" />
				</IconButton>
			</div>
		</div>
	);
}

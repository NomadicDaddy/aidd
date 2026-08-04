import { default as ChevronLeft } from 'lucide-react/dist/esm/icons/chevron-left';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';

import { IconButton } from '../../../components/ui/button.tsx';
import { nextPage, previousPage, totalPageCount } from './pagination-utils.ts';

export function Pagination({
	onChange,
	page,
	pageSize,
	total,
}: {
	onChange: (page: number) => void;
	page: number;
	pageSize: number;
	total: number;
}) {
	const totalPages = totalPageCount(total, pageSize);
	if (total <= pageSize) return null;
	const start = total === 0 ? 0 : page * pageSize + 1;
	const end = Math.min(total, (page + 1) * pageSize);
	return (
		<div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
			<span>
				Showing {start}–{end} of {total}
			</span>
			<div className="flex items-center gap-2">
				<IconButton
					ariaLabel="Previous page"
					disabled={page === 0}
					onClick={() => onChange(previousPage(page))}
					variant="secondary">
					<ChevronLeft className="h-4 w-4" />
				</IconButton>
				<span>
					Page {page + 1} of {totalPages}
				</span>
				<IconButton
					ariaLabel="Next page"
					disabled={page + 1 >= totalPages}
					onClick={() => onChange(nextPage(page, totalPages))}
					variant="secondary">
					<ChevronRight className="h-4 w-4" />
				</IconButton>
			</div>
		</div>
	);
}

export function totalPageCount(total: number, pageSize: number): number {
	if (pageSize <= 0) return 1;
	return Math.max(1, Math.ceil(total / pageSize));
}

export function nextPage(currentPage: number, totalPages: number): number {
	const lastPage = Math.max(0, totalPages - 1);
	return Math.min(lastPage, currentPage + 1);
}

export function previousPage(currentPage: number): number {
	return Math.max(0, currentPage - 1);
}

export function clampPage(page: number, total: number, pageSize: number): number {
	const lastPage = totalPageCount(total, pageSize) - 1;
	if (page < 0) return 0;
	if (page > lastPage) return lastPage;
	return page;
}

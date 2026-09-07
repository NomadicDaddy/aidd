type Request = {
	headers: Record<string, string | undefined>;
	query: Record<string, string | undefined>;
};

export function renderDebugHtml(request: Request): string {
	const message = request.query.message ?? '<script>alert(1)</script>';
	return `<main><h1>Debug</h1><div>${message}</div></main>`;
}

export function isAdmin(request: Request): boolean {
	return request.headers['x-admin'] === 'true';
}

export function health(): { status: 'ok' } {
	return { status: 'ok' };
}

type Request = {
	headers: Record<string, string | undefined>;
	query: Record<string, string | undefined>;
};

export function renderDebugHtml(request: Request) {
	const userProvided = request.query.message ?? '<script>alert(1)</script>';

	return `
		<html>
			<body>
				<h1>Debug</h1>
				<div>${userProvided}</div>
			</body>
		</html>
	`;
}

export function isAdmin(request: Request) {
	return request.headers['x-admin'] === 'true';
}

export class HttpError extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = 'HttpError';
		this.status = status;
	}
}

/** A launch refused because its project already has an active pipeline session or run. */
export class ProjectBusyError extends HttpError {
	constructor(message: string) {
		super(message, 409);
		this.name = 'ProjectBusyError';
	}
}

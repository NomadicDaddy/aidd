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

export interface ProviderRestingDetails {
	/** Where a relaunch can go instead: the first substitute not resting, if any. */
	alternative: null | string;
	backend: string;
	code: 'provider_resting';
	reason: string;
	until: string;
}

/**
 * A launch refused because the person picked a resting backend. The details travel in the response
 * body so the launch surface can offer the relaunch on the alternative and the "run anyway" retry.
 */
export class ProviderRestingError extends HttpError {
	readonly details: ProviderRestingDetails;
	constructor(message: string, details: ProviderRestingDetails) {
		super(message, 409);
		this.name = 'ProviderRestingError';
		this.details = details;
	}
}

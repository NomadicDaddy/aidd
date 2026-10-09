import { type BackendName, backendNames } from 'aidd-shared/plan/types';
import { toast } from 'sonner';

import { ApiError } from '../api/client.ts';
import { backendLabel } from './backends.ts';

/** The server's answer when a person picked a resting backend for a launch. */
export interface RestRefusal {
	alternative: BackendName | null;
	backend: string;
	message: string;
}

type RestChoice = 'alternative' | 'anyway' | 'dismissed';

interface RestRetargetable {
	backend?: BackendName | undefined;
	ignoreRest?: boolean;
	model?: string | undefined;
	reasoningEffort?: string | undefined;
}

function asBackend(value: unknown): BackendName | null {
	for (const name of backendNames) {
		if (name === value) return name;
	}
	return null;
}

export function readRestRefusal(error: unknown): RestRefusal | undefined {
	if (!(error instanceof ApiError) || error.status !== 409) return undefined;
	const body = error.body;
	if (typeof body !== 'object' || body === null) return undefined;
	const record = body as Record<string, unknown>;
	if (record.code !== 'provider_resting' || typeof record.backend !== 'string') return undefined;
	return {
		alternative: asBackend(record.alternative),
		backend: record.backend,
		message: error.message,
	};
}

function askRestChoice(refusal: RestRefusal): Promise<RestChoice> {
	return new Promise((resolve) => {
		let settled = false;
		const settle = (choice: RestChoice): void => {
			if (settled) return;
			settled = true;
			resolve(choice);
		};
		const alternative = refusal.alternative;
		toast.warning(refusal.message, {
			cancel: { label: 'Run anyway', onClick: () => settle('anyway') },
			description:
				alternative === null
					? 'Every substitute is resting too. Run on it anyway, or close this to cancel.'
					: 'Relaunch on another backend, run on this one anyway, or close this to cancel.',
			duration: Number.POSITIVE_INFINITY,
			onAutoClose: () => settle('dismissed'),
			onDismiss: () => settle('dismissed'),
			...(alternative === null
				? {}
				: {
						action: {
							label: 'Relaunch on ' + backendLabel(alternative),
							onClick: () => settle('alternative'),
						},
					}),
		});
	});
}

/**
 * Sends a launch, and when the person picked a resting backend asks them how to go on instead of
 * failing: relaunch on the alternative, which runs on its own configured model and effort since
 * the ones chosen were for the resting backend, or run anyway. Closing the question fails the
 * launch with the original refusal, so the launch surface reports it as it would any error.
 */
export async function launchHonoringRest<R extends RestRetargetable, T>(
	request: R,
	send: (request: R) => Promise<T>,
): Promise<T> {
	try {
		return await send(request);
	} catch (error) {
		const refusal = readRestRefusal(error);
		if (refusal === undefined) throw error;
		const choice = await askRestChoice(refusal);
		if (choice === 'dismissed') throw error;
		if (choice === 'anyway') return await send({ ...request, ignoreRest: true });
		if (refusal.alternative === null) throw error;
		const retargeted: R = { ...request, backend: refusal.alternative };
		delete retargeted.model;
		delete retargeted.reasoningEffort;
		return await send(retargeted);
	}
}

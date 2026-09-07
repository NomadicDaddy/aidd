import { isRecord, numberValue, readJsonUnknown } from '../benchmark/validation.ts';
import { requireUnitInterval } from './manifest.ts';

export const DEFAULT_MIN_RUNS = 3;

/**
 * The pass/fail floors for the attestation. They sit in their own file so a lowered floor is a
 * one-line diff a reviewer sees, never a change buried in a regenerated manifest or attestation.
 */
export interface AuditEvalFloors {
	minPrecision: number;
	minRecall: number;
	/** How many measured runs an audit needs before its averaged score can be attested. */
	minRuns: number;
}

export function parseAuditEvalFloors(value: unknown): AuditEvalFloors {
	if (!isRecord(value)) throw new Error('floors must be an object');
	const minRuns = value.minRuns === undefined ? DEFAULT_MIN_RUNS : numberValue(value.minRuns);
	if (minRuns === undefined || !Number.isInteger(minRuns) || minRuns < 1) {
		throw new Error('floors.minRuns must be a positive integer');
	}
	return {
		minPrecision: requireUnitInterval(value.minPrecision, 'floors.minPrecision'),
		minRecall: requireUnitInterval(value.minRecall, 'floors.minRecall'),
		minRuns,
	};
}

export function loadAuditEvalFloors(floorsPath: string): AuditEvalFloors {
	return parseAuditEvalFloors(readJsonUnknown(floorsPath));
}

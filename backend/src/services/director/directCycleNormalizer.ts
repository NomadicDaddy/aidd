import type {
	DirectorOutput,
	DirectorProfileRecord,
	DirectorRiskLevel,
	DirectorSuggestion,
	DirectorTaskType,
} from 'aidd-shared';

import { directorRiskLevels, directorTaskTypes, dedupDirectorSuggestions } from 'aidd-shared';

import type { FleetSummary } from './types.ts';

export interface DirectCycleContextDocument {
	directive: null | string;
	profile: DirectorProfileRecord;
	recentMessages: { content: string; createdAt: string; role: string }[];
	/** Prior cycles' suggestions with outcomes. Keep in sync with CycleContextDocument. */
	recentSuggestions: {
		createdAt: string;
		dismissedBy: null | string;
		occurrences: number;
		projectId: null | string;
		status: string;
		taskType: string;
		title: string;
	}[];
	sessionId: null | string;
}

export function buildDirectCyclePrompt(
	fleetSummary: FleetSummary,
	profile: DirectorProfileRecord,
	context: DirectCycleContextDocument | undefined
): string {
	const cycleContext: DirectCycleContextDocument = context ?? {
		directive: null,
		profile,
		recentMessages: [],
		recentSuggestions: [],
		sessionId: null,
	};
	return [
		'You are the aidd Director running a read-only advisory cycle.',
		'Analyze only the fleet summary and optional cycle context. Do not modify files, launch runs, or claim work was performed.',
		'Return only one JSON object. Do not wrap it in markdown.',
		'',
		'The JSON object must match this shape:',
		'{',
		'  "fleetSummary": {',
		'    "totalSuggestions": 0,',
		'    "byRisk": { "LOW": 0, "MEDIUM": 0, "HIGH": 0 },',
		'    "byType": {},',
		'    "crossProjectPatterns": [],',
		'    "fleetHealthScore": 0',
		'  },',
		'  "suggestions": [',
		'    {',
		'      "title": "Short action title",',
		'      "description": "What should happen",',
		'      "reasoning": "Why this matters now",',
		'      "riskLevel": "LOW|MEDIUM|HIGH",',
		'      "taskType": "one allowed task type",',
		'      "projectId": "project slug or null",',
		'      "evidence": {},',
		'      "suggestedRecipe": null,',
		'      "suggestedArgs": null,',
		'      "confidence": 0.8',
		'    }',
		'  ]',
		'}',
		'',
		`Allowed taskType values: ${directorTaskTypes.join(', ')}`,
		`Allowed riskLevel values: ${directorRiskLevels.join(', ')}`,
		'Project-specific suggestions must use a project slug from fleetSummary.projects[].slug. Fleet-wide suggestions use null.',
		'Each item in fleetSummary.prioritizedWork is already one concrete, individually-runnable next action against a single artifact (a named audit finding, remediation item, or feature) and carries its own suggestedRecipe/suggestedArgs. Emit those items as separate suggestions, keeping their suggestedRecipe/suggestedArgs intact, with a title that names the specific artifact.',
		'Do NOT merge several artifacts into one sweeping "resolve the whole backlog" suggestion. The only aggregate items are the explicit "+ N more" rollups already present in prioritizedWork — pass those through as-is.',
		'',
		"The cycle context may include recentSuggestions: prior cycles' suggestions with their outcomes.",
		"Entries with dismissedBy='user' were explicitly rejected by the operator. Do NOT re-suggest an equivalent item (same project, same action) unless the underlying evidence has materially changed since the dismissal — and if it has, state what changed in the reasoning field.",
		"Entries with dismissedBy='cycle_retire' merely expired at the next cycle and may be re-suggested if still relevant.",
		'When the same maintenance action applies to many projects, prefer fewer, higher-value suggestions per cycle over one identical suggestion per project.',
		'',
		'## Active Director Profile',
		JSON.stringify(profile, null, 2),
		'',
		'## Cycle Context',
		JSON.stringify(cycleContext, null, 2),
		'',
		'## Fleet Summary',
		JSON.stringify(fleetSummary, null, 2),
	].join('\n');
}

export function normalizeDirectDirectorOutput(
	value: unknown,
	fleetSummary: FleetSummary
): DirectorOutput {
	if (!isRecord(value)) throw new Error('Direct AI director output must be an object.');
	const rawFleetSummary = value.fleetSummary;
	if (!isRecord(rawFleetSummary)) {
		throw new Error('Direct AI director output requires fleetSummary.');
	}
	if (!Array.isArray(value.suggestions)) {
		throw new Error('Direct AI director output requires a suggestions array.');
	}
	const suggestions = dedupDirectorSuggestions(
		value.suggestions.map((suggestion, index) => normalizeDirectSuggestion(suggestion, index))
	);
	return {
		fleetSummary: {
			byRisk: countSuggestionsByRisk(suggestions),
			byType: countSuggestionsByType(suggestions),
			crossProjectPatterns: stringArray(rawFleetSummary.crossProjectPatterns),
			fleetHealthScore:
				numberOrUndefined(rawFleetSummary.fleetHealthScore) ??
				fleetSummary.fleetAggregations.fleetHealthScore,
			totalSuggestions: suggestions.length,
		},
		suggestions,
	};
}

function normalizeDirectSuggestion(value: unknown, index: number): DirectorSuggestion {
	if (!isRecord(value)) {
		throw new Error(`Direct AI director suggestion ${index + 1} must be an object.`);
	}
	const riskLevel = normalizeRiskLevel(value.riskLevel, index);
	const taskType = normalizeTaskType(value.taskType, index);
	const confidence = numberOrUndefined(value.confidence);
	const suggestedArgs = normalizeSuggestedArgs(value.suggestedArgs);
	const suggestedRecipe = nullableString(value.suggestedRecipe);
	return {
		...(confidence === undefined ? {} : { confidence: clampConfidence(confidence) }),
		description: requiredString(value.description, 'description', index),
		evidence: normalizeEvidence(value.evidence),
		projectId: nullableString(value.projectId),
		reasoning: requiredString(value.reasoning, 'reasoning', index),
		riskLevel,
		...(suggestedArgs === null ? {} : { suggestedArgs }),
		...(suggestedRecipe === null ? {} : { suggestedRecipe }),
		taskType,
		title: requiredString(value.title, 'title', index),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, index: number): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`Direct AI director suggestion ${index + 1} requires non-empty ${field}.`);
	}
	return value.trim();
}

function nullableString(value: unknown): null | string {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === 'string')
		.map((item) => item.trim())
		.filter(Boolean);
}

function numberOrUndefined(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clampConfidence(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function normalizeEvidence(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

function normalizeSuggestedArgs(value: unknown): null | Record<string, string> {
	if (value === null || value === undefined) return null;
	if (!isRecord(value)) throw new Error('Direct AI director suggestedArgs must be an object.');
	const result: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry !== 'string') {
			throw new Error('Direct AI director suggestedArgs values must be strings.');
		}
		result[key] = entry;
	}
	return Object.keys(result).length > 0 ? result : null;
}

function normalizeRiskLevel(value: unknown, index: number): DirectorRiskLevel {
	if (typeof value === 'string' && (directorRiskLevels as readonly string[]).includes(value)) {
		return value as DirectorRiskLevel;
	}
	throw new Error(`Direct AI director suggestion ${index + 1} has invalid riskLevel.`);
}

function normalizeTaskType(value: unknown, index: number): DirectorTaskType {
	if (typeof value === 'string' && (directorTaskTypes as readonly string[]).includes(value)) {
		return value as DirectorTaskType;
	}
	throw new Error(`Direct AI director suggestion ${index + 1} has invalid taskType.`);
}

function countSuggestionsByRisk(
	suggestions: DirectorSuggestion[]
): Record<DirectorRiskLevel, number> {
	const counts: Record<DirectorRiskLevel, number> = { HIGH: 0, LOW: 0, MEDIUM: 0 };
	for (const suggestion of suggestions) {
		counts[suggestion.riskLevel] += 1;
	}
	return counts;
}

function countSuggestionsByType(
	suggestions: DirectorSuggestion[]
): Partial<Record<DirectorTaskType, number>> {
	const counts: Partial<Record<DirectorTaskType, number>> = {};
	for (const suggestion of suggestions) {
		counts[suggestion.taskType] = (counts[suggestion.taskType] ?? 0) + 1;
	}
	return counts;
}

export function statusToExitCode(status: string): number {
	switch (status) {
		case 'completed':
			return 0;
		case 'failed':
			return 1;
		case 'killed':
			return -1;
		case 'stopped':
			return 130;
		default:
			return 1;
	}
}

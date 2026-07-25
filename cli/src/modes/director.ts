import type {
	ModeContext,
	ModeHandler,
	ModeResult,
	ModeSummary,
	SelectedWork,
} from 'aidd-shared/modes/types';
import type { AgentRunResult } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';

import {
	dedupDirectorSuggestions,
	type DirectorOutput,
	type DirectorRiskLevel,
	directorRiskLevels,
	type DirectorSuggestion,
	type DirectorTaskType,
	directorTaskTypes,
} from 'aidd-shared';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export { directorRiskLevels, directorTaskTypes };

export function createDirectorMode(plan: RunPlan): ModeHandler {
	return {
		async buildPromptPlan() {
			return plan.prompt;
		},
		async isComplete(_context: ModeContext, result: ModeResult): Promise<boolean> {
			return result.complete;
		},
		name: 'director',
		async processResult(_context: ModeContext, result: AgentRunResult): Promise<ModeResult> {
			if (!plan.director) {
				return {
					complete: false,
					summary: 'director missing output plan',
				};
			}

			const outputPath = plan.director.outputPath;
			const resolution = await resolveDirectorOutput(result, outputPath);
			if (resolution.status !== 'ok') {
				const marker =
					resolution.status === 'missing'
						? 'director_output_missing'
						: 'director_output_invalid';
				const fallback = emptyOutput([marker]);
				await mkdir(dirname(outputPath), { recursive: true });
				await writeFile(outputPath, `${JSON.stringify(fallback, null, 2)}\n`);
				const summary =
					resolution.status === 'missing'
						? 'director output missing'
						: 'director output invalid';
				return {
					artifacts: {
						byRisk: fallback.fleetSummary.byRisk,
						byType: fallback.fleetSummary.byType,
						directorOutput: fallback,
						outputPath,
						outputStatus: resolution.status,
						suggestions: fallback.suggestions,
						totalSuggestions: 0,
					},
					complete: false,
					summary,
				};
			}

			const normalized = normalizeDirectorOutput(resolution.value);
			await mkdir(dirname(outputPath), { recursive: true });
			await writeFile(outputPath, `${JSON.stringify(normalized, null, 2)}\n`);

			return {
				artifacts: {
					byRisk: normalized.fleetSummary.byRisk,
					byType: normalized.fleetSummary.byType,
					directorOutput: normalized,
					outputPath,
					outputStatus: 'ok',
					suggestions: normalized.suggestions,
					totalSuggestions: normalized.suggestions.length,
				},
				complete: result.exitCode === 0,
				summary: `director wrote ${normalized.suggestions.length} suggestion(s)`,
			};
		},
		async selectWork(): Promise<SelectedWork> {
			return {
				data: plan.director,
				description: `Analyze fleet summary ${plan.director?.fleetSummaryPath ?? ''}`,
				id: 'director',
				kind: 'generic',
			};
		},
		async summarize(_context: ModeContext, result: ModeResult): Promise<ModeSummary> {
			return { text: result.summary };
		},
	};
}

type OutputResolution =
	{ status: 'invalid' } | { status: 'missing' } | { status: 'ok'; value: unknown };

// The model writes the full director output to `outputPath`; that file is the primary contract.
// The AIDD_RESULT marker (structuredResult) is a completion signal that older prompts also
// stuffed the whole output into. For large suggestion sets the model reliably writes the file
// but lets the marker's `suggestions[]` go empty, so trusting the marker over the file silently
// dropped every suggestion. Prefer whichever source carries more suggestions; the written file
// wins ties, and the marker is used only as a fallback when the file is missing or unparseable.
async function resolveDirectorOutput(
	result: AgentRunResult,
	outputPath: string,
): Promise<OutputResolution> {
	const fileResolution = await readDirectorFile(outputPath);
	const markerValue = markerCandidate(result.structuredResult);

	const fileCount = fileResolution.status === 'ok' ? suggestionCount(fileResolution.value) : -1;
	const markerCount = markerValue !== undefined ? suggestionCount(markerValue) : -1;
	if (fileResolution.status === 'ok' && fileCount >= markerCount) {
		return fileResolution;
	}
	if (markerValue !== undefined) {
		return { status: 'ok', value: markerValue };
	}
	return fileResolution;
}

// Extracts the director output the model may have echoed into the AIDD_RESULT marker. Supports
// the historical `{ directorOutput: {...} }` wrapper and the flatter `{ suggestions, fleetSummary }`
// shape; returns undefined when the marker carries neither (e.g. the new completion-only marker).
function markerCandidate(structured: Record<string, unknown> | undefined): unknown {
	if (!structured) return undefined;
	if (structured.directorOutput !== undefined) {
		return isRecord(structured.directorOutput) ? structured.directorOutput : undefined;
	}
	if (structured.suggestions !== undefined || structured.fleetSummary !== undefined) {
		return structured;
	}
	return undefined;
}

async function readDirectorFile(outputPath: string): Promise<OutputResolution> {
	let text: string;
	try {
		text = await readFile(outputPath, 'utf8');
	} catch {
		return { status: 'missing' };
	}
	try {
		const parsed = JSON.parse(text) as unknown;
		return isRecord(parsed) ? { status: 'ok', value: parsed } : { status: 'invalid' };
	} catch {
		return { status: 'invalid' };
	}
}

function suggestionCount(value: unknown): number {
	if (!isRecord(value)) return 0;
	return Array.isArray(value.suggestions) ? value.suggestions.length : 0;
}

function normalizeDirectorOutput(raw: unknown): DirectorOutput {
	if (!isRecord(raw)) return emptyOutput(['director_output_invalid']);
	const rawSuggestions = Array.isArray(raw.suggestions) ? raw.suggestions : [];
	const suggestions = dedupDirectorSuggestions(
		rawSuggestions
			.map(normalizeSuggestion)
			.filter((suggestion): suggestion is DirectorSuggestion => suggestion !== null),
	).slice(0, 20);
	const rawFleetSummary = isRecord(raw.fleetSummary) ? raw.fleetSummary : {};
	const crossProjectPatterns = Array.isArray(rawFleetSummary.crossProjectPatterns)
		? rawFleetSummary.crossProjectPatterns.filter(
				(item): item is string => typeof item === 'string',
			)
		: [];
	const fleetHealthScore =
		typeof rawFleetSummary.fleetHealthScore === 'number'
			? rawFleetSummary.fleetHealthScore
			: undefined;
	const output: DirectorOutput = {
		fleetSummary: {
			byRisk: countByRisk(suggestions),
			byType: countByType(suggestions),
			crossProjectPatterns,
			totalSuggestions: suggestions.length,
		},
		suggestions,
	};
	if (fleetHealthScore !== undefined) output.fleetSummary.fleetHealthScore = fleetHealthScore;
	return output;
}

function normalizeSuggestion(raw: unknown): DirectorSuggestion | null {
	if (!isRecord(raw)) return null;
	const taskType = directorTaskTypes.includes(raw.taskType as DirectorTaskType)
		? (raw.taskType as DirectorTaskType)
		: undefined;
	const riskLevel = directorRiskLevels.includes(raw.riskLevel as DirectorRiskLevel)
		? (raw.riskLevel as DirectorRiskLevel)
		: undefined;
	const title = stringValue(raw.title)?.slice(0, 200);
	const description = stringValue(raw.description)?.slice(0, 2000);
	const reasoning = stringValue(raw.reasoning)?.slice(0, 2000);
	if (!taskType || !riskLevel || !title || !description || !reasoning) return null;

	const suggestion: DirectorSuggestion = {
		confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
		description,
		evidence: isRecord(raw.evidence) ? raw.evidence : {},
		projectId:
			typeof raw.projectId === 'string' || raw.projectId === null ? raw.projectId : null,
		reasoning,
		riskLevel,
		suggestedArgs: normalizeSuggestedArgs(raw.suggestedArgs),
		suggestedRecipe: typeof raw.suggestedRecipe === 'string' ? raw.suggestedRecipe : null,
		taskType,
		title,
	};
	return suggestion;
}

function countByRisk(suggestions: DirectorSuggestion[]): Record<DirectorRiskLevel, number> {
	return {
		HIGH: suggestions.filter((suggestion) => suggestion.riskLevel === 'HIGH').length,
		LOW: suggestions.filter((suggestion) => suggestion.riskLevel === 'LOW').length,
		MEDIUM: suggestions.filter((suggestion) => suggestion.riskLevel === 'MEDIUM').length,
	};
}

function countByType(suggestions: DirectorSuggestion[]): Partial<Record<DirectorTaskType, number>> {
	const counts: Partial<Record<DirectorTaskType, number>> = {};
	for (const suggestion of suggestions) {
		counts[suggestion.taskType] = (counts[suggestion.taskType] ?? 0) + 1;
	}
	return counts;
}

function emptyOutput(crossProjectPatterns: string[] = []): DirectorOutput {
	return {
		fleetSummary: {
			byRisk: { HIGH: 0, LOW: 0, MEDIUM: 0 },
			byType: {},
			crossProjectPatterns,
			totalSuggestions: 0,
		},
		suggestions: [],
	};
}

function normalizeSuggestedArgs(value: unknown): null | Record<string, string> {
	if (!isRecord(value)) return null;
	return Object.fromEntries(
		Object.entries(value).filter(
			(entry): entry is [string, string] => typeof entry[1] === 'string',
		),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

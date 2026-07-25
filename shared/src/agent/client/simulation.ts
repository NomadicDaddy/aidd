import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AgentClient, AgentLoopRequest, AgentLoopResponse } from './types.ts';

import { metadataPath } from '../../metadata/paths.ts';

export class SimulationAgentClient implements AgentClient {
	async complete(request: AgentLoopRequest, signal: AbortSignal): Promise<AgentLoopResponse> {
		if (signal.aborted) {
			throw new DOMException('Native simulation aborted', 'AbortError');
		}

		const resultMarker = request.prompt.match(
			/AIDD_RESULT:\s*(\{"featureId":"[^"]+","status":"completed","passes":true\})/,
		);
		const structuredResult = resultMarker?.[1] ?? simulationResultFromPrompt(request.prompt);
		const filesModified = await completeSimulatedFeature(request.cwd, structuredResult);
		return {
			text: [
				'aidd v2 native backend is installed.',
				`cwd: ${request.cwd}`,
				request.model ? `model: ${request.model}` : undefined,
				structuredResult ? `AIDD_RESULT: ${structuredResult}` : undefined,
			]
				.filter(Boolean)
				.join('\n'),
			...(filesModified.length > 0 ? { filesModified } : {}),
		};
	}
}

async function completeSimulatedFeature(
	projectDir: string,
	structuredResult: string | undefined,
): Promise<string[]> {
	const result = parseSimulatedFeatureCompletion(structuredResult);
	if (!result) return [];
	const featurePath = join(
		metadataPath(projectDir),
		'features',
		result.featureId,
		'feature.json',
	);
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(featurePath, 'utf8'));
	} catch {
		return [];
	}
	if (!isRecord(parsed)) return [];
	await writeFile(
		featurePath,
		`${JSON.stringify({ ...parsed, passes: true, status: 'completed' }, null, 2)}\n`,
	);
	return [featurePath];
}

function parseSimulatedFeatureCompletion(
	structuredResult: string | undefined,
): { featureId: string } | undefined {
	if (!structuredResult) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(structuredResult);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed)) return undefined;
	if (parsed.status !== 'completed' || parsed.passes !== true) return undefined;
	if (typeof parsed.featureId !== 'string' || parsed.featureId.length === 0) return undefined;
	if (parsed.featureId.includes('/') || parsed.featureId.includes('\\')) return undefined;
	return { featureId: parsed.featureId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function simulationResultFromPrompt(prompt: string): string | undefined {
	if (prompt.includes('AIDD_RESULT: {"todoCompleted":true}')) {
		return '{"todoCompleted":true}';
	}
	if (prompt.includes('AIDD_RESULT: {"auditFindings"')) {
		return '{"auditFindings":[],"reportMarkdown":"# SECURITY Audit Report\\n\\nNo findings supplied."}';
	}
	if (prompt.includes('AIDD_RESULT: {"responseMarkdown"')) {
		return JSON.stringify({
			responseMarkdown: [
				'# Question 1: What does this fixture verify?',
				'',
				'## Question',
				'',
				'## What does this fixture verify?',
				'',
				'Explain the artifact fixture.',
				'',
				'## Response',
				'',
				'Simulated interview response.',
				'',
			].join('\n'),
		});
	}
	if (prompt.includes('AIDD_RESULT: {"directorOutputWritten"')) {
		// The real director marker is now just a completion signal; the suggestions live in the
		// written output file. The simulator writes no file, so it returns a directorOutput-shaped
		// result that resolveDirectorOutput honors as the marker fallback — an empty, valid output.
		return JSON.stringify({
			directorOutput: {
				fleetSummary: {
					byRisk: { HIGH: 0, LOW: 0, MEDIUM: 0 },
					byType: {},
					crossProjectPatterns: [],
					totalSuggestions: 0,
				},
				suggestions: [],
			},
		});
	}
	return undefined;
}

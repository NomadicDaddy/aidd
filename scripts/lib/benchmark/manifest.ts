import { normalizeReasoningEffort, normalizeThinkingLevel } from 'aidd-shared/args/constants';
import path from 'node:path';

import type {
	BenchmarkBackendName,
	BenchmarkCohort,
	BenchmarkManifest,
	BenchmarkModelPricing,
	BenchmarkStack,
	BenchmarkTask,
} from './types.ts';

import { parseAuditEvalCatalog, parseAuditEvalScoring } from '../audit-eval/manifest.ts';
import { backendNames } from './constants.ts';
import {
	booleanValue,
	isRecord,
	numberValue,
	optionalInteger,
	optionalString,
	readJsonUnknown,
	requireNumber,
	requireRecord,
	requireString,
	stringArray,
} from './validation.ts';

function normalizeBackendName(raw: string): BenchmarkBackendName {
	if ((backendNames as readonly string[]).includes(raw)) return raw as BenchmarkBackendName;
	throw new Error(
		`Unsupported benchmark backend '${raw}'. Valid backends: ${backendNames.join(', ')}`,
	);
}

function readManifest(filePath: string): BenchmarkManifest {
	const raw = requireRecord(readJsonUnknown(filePath), 'manifest');
	const stacksRaw = raw.stacks;
	const tasksRaw = raw.tasks;
	const cohortsRaw = raw.cohorts;
	if (!Array.isArray(stacksRaw) || stacksRaw.length === 0) {
		throw new Error('manifest.stacks must contain at least one stack');
	}
	if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
		throw new Error('manifest.tasks must contain at least one task');
	}
	if (!Array.isArray(cohortsRaw)) throw new Error('manifest.cohorts must be an array');
	const scoringRecord = requireRecord(raw.scoring, 'manifest.scoring');
	const auditEvalScoring = parseAuditEvalScoring(scoringRecord.auditEval);

	const stacks = stacksRaw.map((entry, index): BenchmarkStack => {
		const record = requireRecord(entry, `manifest.stacks[${index}]`);
		const stack: BenchmarkStack = {
			cli: normalizeBackendName(requireString(record, 'cli', `manifest.stacks[${index}]`)),
			label: requireString(record, 'label', `manifest.stacks[${index}]`),
			model: requireString(record, 'model', `manifest.stacks[${index}]`),
			view: requireString(record, 'view', `manifest.stacks[${index}]`),
		};
		const provider = optionalString(record, 'provider', `manifest.stacks[${index}]`);
		const reasoningEffort = optionalString(
			record,
			'reasoningEffort',
			`manifest.stacks[${index}]`,
		);
		const thinkingLevel = optionalString(record, 'thinkingLevel', `manifest.stacks[${index}]`);
		const simulation = booleanValue(record.simulation);
		const thinking = booleanValue(record.thinking);
		if (provider !== undefined) stack.provider = provider;
		if (reasoningEffort !== undefined) {
			const normalized = normalizeReasoningEffort(reasoningEffort);
			if (normalized === undefined) {
				throw new Error(`manifest.stacks[${index}].reasoningEffort is invalid`);
			}
			stack.reasoningEffort = normalized;
		}
		if (simulation !== undefined) stack.simulation = simulation;
		if (thinking !== undefined) stack.thinking = thinking;
		if (thinkingLevel !== undefined) {
			const normalized = normalizeThinkingLevel(thinkingLevel);
			if (normalized === undefined) {
				throw new Error(
					`manifest.stacks[${index}].thinkingLevel must be low, medium, or high`,
				);
			}
			if (thinking === false) {
				throw new Error(
					`manifest.stacks[${index}].thinkingLevel cannot be combined with thinking: false`,
				);
			}
			stack.thinkingLevel = normalized;
		}
		return stack;
	});

	const labels = new Set<string>();
	for (const stack of stacks) {
		if (labels.has(stack.label)) throw new Error(`Duplicate stack label: ${stack.label}`);
		labels.add(stack.label);
	}

	const tasks = tasksRaw.map((entry, index): BenchmarkTask => {
		const record = requireRecord(entry, `manifest.tasks[${index}]`);
		const category = requireString(record, 'category', `manifest.tasks[${index}]`);
		if (category !== 'agentic' && category !== 'control') {
			throw new Error(`manifest.tasks[${index}].category must be agentic or control`);
		}
		const task: BenchmarkTask = {
			category,
			command: requireString(record, 'command', `manifest.tasks[${index}]`),
			fixture: requireString(record, 'fixture', `manifest.tasks[${index}]`),
			id: requireString(record, 'id', `manifest.tasks[${index}]`),
			timeoutSeconds: requireNumber(record, 'timeoutSeconds', `manifest.tasks[${index}]`),
		};
		const evaluation = optionalString(record, 'evaluation', `manifest.tasks[${index}]`);
		const scoredRepetitions = optionalInteger(
			record,
			'scoredRepetitions',
			`manifest.tasks[${index}]`,
		);
		const warmupRepetitions = optionalInteger(
			record,
			'warmupRepetitions',
			`manifest.tasks[${index}]`,
		);
		if (evaluation !== undefined) task.evaluation = evaluation;
		if (record.auditEval !== undefined) {
			task.auditEval = parseAuditEvalCatalog(
				record.auditEval,
				`manifest.tasks[${index}].auditEval`,
				auditEvalScoring,
			);
		}
		if (scoredRepetitions !== undefined) task.scoredRepetitions = scoredRepetitions;
		if (warmupRepetitions !== undefined) task.warmupRepetitions = warmupRepetitions;
		return task;
	});

	const taskIds = new Set<string>();
	for (const task of tasks) {
		if (taskIds.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
		taskIds.add(task.id);
	}

	const settingsRecord = isRecord(raw.settings) ? raw.settings : {};
	const preflightRecord = isRecord(settingsRecord.preflight) ? settingsRecord.preflight : {};
	const fixedEnvRecord = isRecord(settingsRecord.fixedEnv) ? settingsRecord.fixedEnv : {};
	const fixedEnv: Record<string, string> = {};
	for (const [key, value] of Object.entries(fixedEnvRecord)) {
		if (typeof value !== 'string')
			throw new Error(`manifest.settings.fixedEnv.${key} must be a string`);
		fixedEnv[key] = value;
	}

	const pricingRaw = isRecord(raw.pricing) ? raw.pricing : {};
	const pricing: Record<string, BenchmarkModelPricing> = {};
	for (const [family, entry] of Object.entries(pricingRaw)) {
		const record = requireRecord(entry, `manifest.pricing['${family}']`);
		const model: BenchmarkModelPricing = {
			inputPerMtok: requireNumber(record, 'inputPerMtok', `manifest.pricing['${family}']`),
			outputPerMtok: requireNumber(record, 'outputPerMtok', `manifest.pricing['${family}']`),
		};
		const cachedPerMtok = numberValue(record.cachedPerMtok);
		const reasoningPerMtok = numberValue(record.reasoningPerMtok);
		if (cachedPerMtok !== undefined) model.cachedPerMtok = cachedPerMtok;
		if (reasoningPerMtok !== undefined) model.reasoningPerMtok = reasoningPerMtok;
		pricing[family] = model;
	}

	return {
		cohorts: cohortsRaw.map((entry, index): BenchmarkCohort => {
			const record = requireRecord(entry, `manifest.cohorts[${index}]`);
			return {
				members: stringArray(record.members),
				name: requireString(record, 'name', `manifest.cohorts[${index}]`),
				targetModelFamily: requireString(
					record,
					'targetModelFamily',
					`manifest.cohorts[${index}]`,
				),
			};
		}),
		pricing,
		scoring: {
			...(auditEvalScoring ? { auditEval: auditEvalScoring } : {}),
			correctnessWeight: requireNumber(
				scoringRecord,
				'correctnessWeight',
				'manifest.scoring',
			),
			costPolicy: requireString(scoringRecord, 'costPolicy', 'manifest.scoring'),
			costWeight: requireNumber(scoringRecord, 'costWeight', 'manifest.scoring'),
			reliabilityWeight: requireNumber(
				scoringRecord,
				'reliabilityWeight',
				'manifest.scoring',
			),
			timeWeight: requireNumber(scoringRecord, 'timeWeight', 'manifest.scoring'),
		},
		settings: {
			controlTasksExcludedFromComposite:
				booleanValue(settingsRecord.controlTasksExcludedFromComposite) ?? true,
			fixedEnv,
			preflight: {
				timeoutSeconds: numberValue(preflightRecord.timeoutSeconds) ?? 180,
			},
			scoredRepetitions: numberValue(settingsRecord.scoredRepetitions) ?? 3,
			warmupRepetitions: numberValue(settingsRecord.warmupRepetitions) ?? 1,
		},
		stacks,
		tasks,
		version: 1,
	};
}

export function loadManifest(filePath: string): BenchmarkManifest {
	return readManifest(path.resolve(filePath));
}

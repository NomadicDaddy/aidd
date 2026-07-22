import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import type {
	BenchmarkArtifacts,
	BenchmarkTask,
	CommandResult,
	EvaluationResult,
	ParsedMetrics,
} from './types.ts';

import { listFiles, runCommand } from './execution.ts';
import {
	clampScore,
	commandSucceeded,
	controlCommandSucceeded,
	readTextIfExists,
} from './shared.ts';
import { isRecord, numberValue, readJsonUnknown, stringArray, stringValue } from './validation.ts';

function readExpectation(workspaceDir: string): Record<string, unknown> {
	const expectationPath = path.join(workspaceDir, '.benchmark.expectations.json');
	if (!existsSync(expectationPath)) return {};
	const parsed = readJsonUnknown(expectationPath);
	return isRecord(parsed) ? parsed : {};
}

function hasNonEmptyFile(workspaceDir: string, relativePath: string): boolean {
	return readTextIfExists(path.join(workspaceDir, relativePath)).trim().length > 0;
}

function expandSimpleGlob(workspaceDir: string, pattern: string): string[] {
	if (!pattern.includes('*')) {
		const filePath = path.join(workspaceDir, pattern);
		return existsSync(filePath) ? [filePath] : [];
	}
	const normalized = pattern.replaceAll('\\', '/');
	const lastSlash = normalized.lastIndexOf('/');
	const dir = lastSlash === -1 ? '.' : normalized.slice(0, lastSlash);
	const namePattern = normalized.slice(lastSlash + 1);
	const regex = new RegExp(`^${namePattern.split('*').map(escapeRegExp).join('.*')}$`);
	const fullDir = path.join(workspaceDir, dir);
	if (!existsSync(fullDir)) return [];
	return readdirSync(fullDir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && regex.test(entry.name))
		.map((entry) => path.join(fullDir, entry.name));
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readFeature(workspaceDir: string, featureId: string): Record<string, unknown> | undefined {
	const filePath = path.join(workspaceDir, '.aidd', 'features', featureId, 'feature.json');
	if (!existsSync(filePath)) return undefined;
	try {
		const parsed = readJsonUnknown(filePath);
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function statusRunScore(runSucceeded: boolean): EvaluationResult {
	return {
		notes: runSucceeded ? [] : ['command did not complete successfully'],
		score: runSucceeded ? 1 : 0,
	};
}

function evaluateInterview(
	workspaceDir: string,
	expectation: Record<string, unknown>
): EvaluationResult {
	const responseFiles = stringArray(expectation.responseFiles);
	const present = responseFiles.filter((filePath) => hasNonEmptyFile(workspaceDir, filePath));
	if (present.length > 0) return { notes: [`response files: ${present.join(', ')}`], score: 1 };
	return { notes: ['expected interview response file was not written'], score: 0 };
}

function evaluateQuiz(
	workspaceDir: string,
	expectation: Record<string, unknown>
): EvaluationResult {
	const responseFiles = stringArray(expectation.responseFiles);
	const corpus = responseFiles
		.map((filePath) => readTextIfExists(path.join(workspaceDir, filePath)))
		.join('\n');
	if (!corpus.trim()) return { notes: ['quiz response was not written'], score: 0 };
	const questionsRaw = Array.isArray(expectation.questions) ? expectation.questions : [];
	let earned = 0;
	let total = 0;
	const notes: string[] = [];
	for (const questionRaw of questionsRaw) {
		if (!isRecord(questionRaw)) continue;
		const weight = numberValue(questionRaw.weight) ?? 0;
		const expected = stringArray(questionRaw.expected);
		const id = stringValue(questionRaw.id) ?? 'unknown';
		total += weight;
		const lowerCorpus = corpus.toLowerCase();
		const matches = expected.filter((token) => lowerCorpus.includes(token.toLowerCase()));
		const ratio = expected.length > 0 ? matches.length / expected.length : 0;
		earned += weight * ratio;
		notes.push(`${id}: ${matches.length}/${expected.length} expected tokens`);
	}
	return { notes, score: total > 0 ? clampScore(earned / total) : 0 };
}

function evaluateAudit(
	workspaceDir: string,
	expectation: Record<string, unknown>
): EvaluationResult {
	const aliases = isRecord(expectation.expectedFindingAliases)
		? expectation.expectedFindingAliases
		: {};
	const expectedIds = stringArray(expectation.expectedFindingIds);
	const reportGlob = stringValue(expectation.reportGlob) ?? '.aidd/audit-reports/*.md';
	const reports = expandSimpleGlob(workspaceDir, reportGlob);
	const featureFiles = listFiles(path.join(workspaceDir, '.aidd', 'features')).filter(
		(filePath) => filePath.endsWith('feature.json')
	);
	const corpus = [...reports.map(readTextIfExists), ...featureFiles.map(readTextIfExists)]
		.join('\n')
		.toLowerCase();
	const matched = expectedIds.filter((id) => {
		const aliasList = stringArray(aliases[id]);
		return aliasList.some((alias) => corpus.includes(alias.toLowerCase()));
	});
	const minimumMatches = numberValue(expectation.minimumMatches) ?? expectedIds.length;
	const score =
		expectedIds.length > 0 ? matched.length / expectedIds.length : reports.length > 0 ? 1 : 0;
	const notes = [
		`matched expected findings: ${matched.length}/${expectedIds.length}`,
		`audit reports: ${reports.length}`,
	];
	if (matched.length < minimumMatches) notes.push(`below minimum matches: ${minimumMatches}`);
	return { notes, score: clampScore(score) };
}

function evaluateRemediation(
	workspaceDir: string,
	expectation: Record<string, unknown>
): EvaluationResult {
	const featureId = stringValue(expectation.featureId);
	if (!featureId) return { notes: ['missing remediation expectation featureId'], score: 0 };
	const feature = readFeature(workspaceDir, featureId);
	const checkCommand = stringArray(expectation.checkCommand);
	const statusOk = feature?.status === 'completed' && feature.passes === true;
	const notesValue = feature?.notes;
	const hasNotes =
		typeof notesValue === 'string'
			? notesValue.trim().length > 0
			: Array.isArray(notesValue) &&
				notesValue.some((note) => typeof note === 'string' && note.trim().length > 0);
	const check =
		checkCommand.length > 0
			? runCommand(checkCommand[0] ?? '', checkCommand.slice(1), workspaceDir, {
					timeoutSeconds: 60,
				})
			: undefined;
	const checkOk = check === undefined || check.status === 0;
	const notes: string[] = [];
	if (!statusOk) notes.push('feature was not marked completed with passes=true');
	if (!hasNotes) notes.push('completed remediation feature is missing resolution notes');
	if (!checkOk)
		notes.push(`check command failed: ${check?.stderr || check?.stdout || 'unknown error'}`);
	return {
		notes,
		score: clampScore((statusOk ? 0.5 : 0) + (checkOk ? 0.4 : 0) + (hasNotes ? 0.1 : 0)),
	};
}

function evaluateValidate(
	workspaceDir: string,
	expectation: Record<string, unknown>,
	artifacts: BenchmarkArtifacts
): EvaluationResult {
	const completedFeatureId = stringValue(expectation.completedFeatureId);
	const incompleteFeatureId = stringValue(expectation.incompleteFeatureId);
	const completed = completedFeatureId
		? readFeature(workspaceDir, completedFeatureId)
		: undefined;
	const incomplete = incompleteFeatureId
		? readFeature(workspaceDir, incompleteFeatureId)
		: undefined;
	const completedOk = completed?.status === 'completed' && completed.passes === true;
	const incompleteOk = incomplete?.status !== 'completed' && incomplete?.passes !== true;
	const structuredOk = artifacts.structuredLogs.length > 0 || artifacts.runsLedger.length > 0;
	const notes: string[] = [];
	if (!completedOk) notes.push('existing completed feature was not preserved');
	if (!incompleteOk) notes.push('future feature was unexpectedly completed');
	if (!structuredOk)
		notes.push('validate run did not leave structured iteration or run-ledger evidence');
	return {
		notes,
		score: clampScore(
			(completedOk ? 0.4 : 0) + (incompleteOk ? 0.4 : 0) + (structuredOk ? 0.2 : 0)
		),
	};
}

export function evaluateTask(input: {
	artifacts: BenchmarkArtifacts;
	commandResult?: CommandResult;
	metrics: ParsedMetrics;
	task: BenchmarkTask;
	workspaceDir: string;
}): EvaluationResult {
	const expectation = readExpectation(input.workspaceDir);
	const evaluation = input.task.evaluation ?? input.task.id;
	if (input.task.category === 'control') {
		const controlSucceeded = input.commandResult
			? controlCommandSucceeded(input.commandResult, input.metrics)
			: input.metrics.exitStatus !== 'failure';
		return statusRunScore(controlSucceeded);
	}
	const runSucceeded = input.commandResult
		? commandSucceeded(input.commandResult, input.metrics)
		: input.metrics.exitStatus !== 'failure';
	switch (evaluation) {
		case 'audit':
			return evaluateAudit(input.workspaceDir, expectation);
		case 'interview':
			return evaluateInterview(input.workspaceDir, expectation);
		case 'quiz':
			return evaluateQuiz(input.workspaceDir, expectation);
		case 'remediation':
			return evaluateRemediation(input.workspaceDir, expectation);
		case 'validate':
			return evaluateValidate(input.workspaceDir, expectation, input.artifacts);
		default:
			return statusRunScore(runSucceeded);
	}
}

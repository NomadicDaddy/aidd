import type { AgentEvent } from 'aidd-shared/backends/types';

import {
	bashToolPattern,
	commandFromArgs,
	editToolPattern,
	pathFromArgs,
	writeToolPattern,
} from 'aidd-shared/orchestrator/details/tool-args';
import { fileChangePathLimit } from 'aidd-shared/runs/file-changes';
import { isAbsolute, relative, resolve } from 'node:path';

export interface ResidualDirtySourceClassification {
	attributed: string[];
	unattributed: string[];
}

export interface RunEvidence {
	commandsRun: ReadonlySet<string>;
	runRecordedPaths: ReadonlySet<string>;
}

function normalizedProjectPath(projectDir: string, path: string): string | undefined {
	const projectRoot = resolve(projectDir);
	const normalized =
		isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path)
			? relative(projectRoot, resolve(path)).replaceAll('\\', '/')
			: path.replaceAll('\\', '/').replace(/^\.\/+/, '');
	if (
		normalized === '' ||
		normalized === '..' ||
		normalized.startsWith('../') ||
		isAbsolute(normalized)
	) {
		return undefined;
	}
	return normalized;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function commandNamesProjectPath(command: string, projectDir: string, path: string): boolean {
	const normalizedCommand = command.replaceAll('\\', '/');
	const absolutePath = resolve(projectDir, path).replaceAll('\\', '/');
	const candidates = [path, `./${path}`, absolutePath];
	const boundary = `[\\s"'=,:;()\\[\\]{}<>|&]`;
	return candidates.some((candidate) => {
		const pattern = new RegExp(`(?:^|${boundary})${escapeRegExp(candidate)}(?=$|${boundary})`);
		return pattern.test(normalizedCommand);
	});
}

/** The single rule for "did this run touch that path": a file-change tool event naming it, or an
 * exact path mention in a recorded shell command. Every dirty-tree decision — run-end reporting,
 * the completion commit gate, recovery staging — must ask this and nothing else, so a concurrent
 * operator edit can never be charged to the run by one caller and excused by another. */
export function runTouchedPath(evidence: RunEvidence, projectDir: string, path: string): boolean {
	for (const recorded of evidence.runRecordedPaths) {
		if (normalizedProjectPath(projectDir, recorded) === path) return true;
	}
	for (const command of evidence.commandsRun) {
		if (commandNamesProjectPath(command, projectDir, path)) return true;
	}
	return false;
}

/** Everything the run has proven it touched, as of mid-iteration. `RunAccumulator` only learns an
 * iteration's writes once `finalizeIteration` has recorded it, so a check running before that
 * point (the completion commit gate) has to union the run so far with what these events show. */
export function runEvidence(input: {
	events: readonly AgentEvent[];
	prior?: {
		commandsRun: ReadonlySet<string>;
		filesCreated: ReadonlySet<string>;
		filesEdited: ReadonlySet<string>;
	};
}): RunEvidence {
	const commandsRun = new Set<string>(input.prior?.commandsRun);
	const runRecordedPaths = new Set<string>([
		...(input.prior?.filesCreated ?? []),
		...(input.prior?.filesEdited ?? []),
	]);
	for (const event of input.events) {
		// A backend's closing `filesModified` is it declaring authorship outright, and is the only
		// signal for a backend that reports its writes in bulk rather than per tool call.
		if (event.type === 'done') {
			for (const path of event.filesModified) runRecordedPaths.add(path);
			continue;
		}
		if (event.type !== 'tool_call') continue;
		if (writeToolPattern.test(event.tool) || editToolPattern.test(event.tool)) {
			const path = pathFromArgs(event.args);
			if (path !== undefined) runRecordedPaths.add(path);
		} else if (bashToolPattern.test(event.tool)) {
			const command = commandFromArgs(event.args);
			if (command !== undefined) commandsRun.add(command);
		}
	}
	return { commandsRun, runRecordedPaths };
}

/** Partition newly dirty source paths by evidence recorded by this run. Baseline-only paths are
 * excluded before this helper is called. */
export function classifyResidualDirtySourcePaths(input: {
	commandsRun: ReadonlySet<string>;
	dirtyNow: readonly string[];
	dirtySourcePathsAtStart: ReadonlySet<string>;
	projectDir: string;
	runRecordedPaths: ReadonlySet<string>;
}): ResidualDirtySourceClassification {
	const attributed: string[] = [];
	const unattributed: string[] = [];
	for (const path of input.dirtyNow) {
		if (input.dirtySourcePathsAtStart.has(path)) continue;
		const target = runTouchedPath(input, input.projectDir, path) ? attributed : unattributed;
		target.push(path);
	}
	const sortPaths = (paths: string[]) =>
		paths.sort((left, right) => left.localeCompare(right)).slice(0, fileChangePathLimit);
	return {
		attributed: sortPaths(attributed),
		unattributed: sortPaths(unattributed),
	};
}

/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';

import { type AiddTriumvirateRoles } from 'aidd-shared/execution-mode';

import type { ProjectLocalIteration, ProjectLocalRun } from '../../../api/types.ts';

import { Badge } from '../../ui/badge.tsx';
import { Tooltip } from '../../ui/tooltip.tsx';
import { ExecutionIdentityBadges } from '../ExecutionIdentityBadges.tsx';

export function runRowKey(run: ProjectLocalRun, index: number): string {
	return run.runId ?? `${run.startedAt ?? 'run'}-${index}`;
}

const phaseModeLabels: Readonly<Record<string, string>> = {
	initializer: 'initializer',
	onboarding: 'onboarding',
};

function runModeLabel(run: ProjectLocalRun): null | string {
	// The initializer/onboarding phases run inside coding mode, so the recorded mode is
	// 'coding'. Surface the phase label instead so initialization runs are not mislabeled.
	const phaseLabel = run.phase ? phaseModeLabels[run.phase] : undefined;
	if (phaseLabel) return phaseLabel;
	return run.mode;
}

export function runRuntimeDetail(run: ProjectLocalRun): string {
	const modeLabel = runModeLabel(run);
	const parts = [
		modeLabel ? `mode ${modeLabel}` : null,
		run.source ? `source ${run.source}` : null,
	].filter((part): part is string => part !== null);
	return parts.length > 0 ? parts.join(' · ') : '—';
}

function roleIdentity(role: { backend: string; model?: string }): ReactNode {
	return (
		<ExecutionIdentityBadges backend={role.backend} model={role.model} withTooltip={false} />
	);
}

function triumvirateRolesTooltip(roles: AiddTriumvirateRoles | null): ReactNode {
	if (!roles) return 'Tri-mode run; role metadata was not recorded.';
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-left">
			<dt className="font-medium">Primary</dt>
			<dd>{roleIdentity(roles.primary)}</dd>
			<dt className="font-medium">Secondary</dt>
			<dd>{roleIdentity(roles.secondary)}</dd>
			<dt className="font-medium">Overseer</dt>
			<dd>{roleIdentity(roles.overseer)}</dd>
			<dt className="font-medium">Execution</dt>
			<dd>{roleIdentity(roles.execution)}</dd>
		</dl>
	);
}

export function TriModeBadge({ roles }: { roles: AiddTriumvirateRoles | null }) {
	return (
		<Tooltip className="max-w-sm" content={triumvirateRolesTooltip(roles)}>
			<span className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
				<Badge tone="teal">Tri-mode</Badge>
			</span>
		</Tooltip>
	);
}

export function groupIterationsByRun(
	runs: ProjectLocalRun[],
	iterations: ProjectLocalIteration[],
): {
	byRunKey: Map<string, ProjectLocalIteration[]>;
	orphans: ProjectLocalIteration[];
	running: ProjectLocalIteration[];
} {
	const runKeysById = new Map<string, string>();
	const windows = runs.map((run, index) => {
		const start = run.startedAt ? Date.parse(run.startedAt) : Number.NaN;
		const end = run.endedAt ? Date.parse(run.endedAt) : Number.POSITIVE_INFINITY;
		const key = runRowKey(run, index);
		if (run.runId) runKeysById.set(run.runId, key);
		return { end, key, start };
	});
	const byRunKey = new Map<string, ProjectLocalIteration[]>();
	for (const { key } of windows) byRunKey.set(key, []);
	const orphans: ProjectLocalIteration[] = [];
	const running: ProjectLocalIteration[] = [];
	// An iteration that matches no run row is normally an orphan (its start time falls outside
	// every recorded run window). But an in-progress iteration legitimately has no run row yet —
	// the runs.jsonl ledger line is only appended when the run finalizes — so surface it as an
	// explicit in-progress entry rather than a window-mismatch orphan.
	const dropUnmatched = (iteration: ProjectLocalIteration) => {
		if (iteration.status === 'running') running.push(iteration);
		else orphans.push(iteration);
	};
	for (const iteration of iterations) {
		if (iteration.runId) {
			const runKey = runKeysById.get(iteration.runId);
			if (runKey) byRunKey.get(runKey)?.push(iteration);
			else dropUnmatched(iteration);
			continue;
		}
		const iterationStart = iteration.startedAt ? Date.parse(iteration.startedAt) : Number.NaN;
		if (Number.isNaN(iterationStart)) {
			dropUnmatched(iteration);
			continue;
		}
		const match = windows.find(
			(window) =>
				!Number.isNaN(window.start) &&
				iterationStart >= window.start &&
				iterationStart <= window.end,
		);
		if (match) {
			byRunKey.get(match.key)?.push(iteration);
		} else {
			dropUnmatched(iteration);
		}
	}
	return { byRunKey, orphans, running };
}

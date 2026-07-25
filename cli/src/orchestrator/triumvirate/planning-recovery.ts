export interface TriumviratePlanningRecovery {
	stages: {
		attempts: number;
		changedPaths: string[];
		stage: string;
	}[];
	status: 'planning_stage_mutation_recovered';
}

export function extractTriumviratePlanningRecovery(
	artifacts: Record<string, unknown>,
): TriumviratePlanningRecovery | undefined {
	const triumvirate = objectValue(artifacts.triumvirate);
	if (!triumvirate) return undefined;
	const stages = [
		planningRecoveryStage('primary', objectValue(triumvirate.primaryPlan)),
		planningRecoveryStage('secondary', objectValue(triumvirate.secondaryPlan)),
		planningRecoveryStage('overseer', objectValue(triumvirate.overseerDecision)),
	].filter((stage): stage is TriumviratePlanningRecovery['stages'][number] => {
		return stage !== undefined;
	});
	if (stages.length === 0) return undefined;
	return { stages, status: 'planning_stage_mutation_recovered' };
}

function planningRecoveryStage(
	stage: string,
	stageArtifact: Record<string, unknown> | undefined,
): TriumviratePlanningRecovery['stages'][number] | undefined {
	const retry = objectValue(stageArtifact?.planningMirrorRetry);
	if (!retry) return undefined;
	const attempts = numberValue(retry.attempts);
	const mutations = arrayValue(retry.previousMutations);
	if (attempts === undefined || mutations.length === 0) return undefined;
	const changedPaths = mutations.flatMap((mutation) => {
		const mutationRecord = objectValue(mutation);
		return mutationRecord ? stringArrayValue(mutationRecord.changedPaths) : [];
	});
	return { attempts, changedPaths: uniqueOrdered(changedPaths), stage };
}

export function appendPlanningRecoverySummary(
	summary: string,
	recovery: TriumviratePlanningRecovery | undefined,
): string {
	if (!recovery || summary.includes(recovery.status)) return summary;
	const stageSummaries = recovery.stages.map((stage) => {
		return `${stage.stage} retried after mirror mutation (${formatPathList(stage.changedPaths)})`;
	});
	return `${summary}; ${recovery.status}: ${stageSummaries.join('; ')}`;
}

function formatPathList(paths: string[]): string {
	if (paths.length === 0) return 'no changed paths recorded';
	const visible = paths.slice(0, 3).join(', ');
	if (paths.length <= 3) return visible;
	return `${visible}, +${paths.length - 3} more`;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

function arrayValue(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function stringArrayValue(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

function numberValue(value: unknown): number | undefined {
	return typeof value === 'number' ? value : undefined;
}

export function uniqueOrdered(values: string[]): string[] {
	return [...new Set(values)];
}

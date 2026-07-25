import type { DirectorCycle, DirectorProfileInput, DirectorRiskLevel } from '../../api/types.ts';

import { textareaClass as sharedTextareaClass } from '../../lib/formStyles.ts';

export const textareaClass = sharedTextareaClass;
export const sectionTitleClass = 'text-base font-semibold text-foreground';
export const sectionDescClass = 'mt-0.5 text-sm text-muted-foreground';

export function riskTone(risk: DirectorRiskLevel): 'amber' | 'emerald' | 'red' {
	if (risk === 'HIGH') return 'red';
	if (risk === 'MEDIUM') return 'amber';
	return 'emerald';
}

export function profileInput(form: DirectorProfileInput): DirectorProfileInput {
	const input: DirectorProfileInput = {
		instructions: form.instructions?.trim() ?? '',
		model: form.model?.trim() || null,
		role: form.role?.trim() || 'Fleet Director',
	};
	if (form.backend) input.backend = form.backend;
	if (form.reasoningEffort) input.reasoningEffort = form.reasoningEffort;
	return input;
}

export function outputArtifactLabel(cycle: DirectorCycle): string {
	if (cycle.status === 'running') {
		// The CLI backend can flush the output file partway through 'running_backend',
		// so file existence alone isn't proof the cycle is done. Stay amber until the
		// cycle moves out of 'running' (persistCycleResult ran or reconcile fired).
		return cycle.artifacts.outputExists ? 'Writing' : 'Pending';
	}
	if (cycle.artifacts.outputExists) return 'Ready';
	return 'Missing';
}

export function contextArtifactLabel(cycle: DirectorCycle): string {
	if (cycle.artifacts.contextExists) return 'Ready';
	if (cycle.stage === 'writing_context') return 'Pending';
	return 'Not used';
}

export function artifactTone(label: string): string {
	if (label === 'Ready') return 'text-emerald-700 dark:text-emerald-300';
	if (label === 'Pending' || label === 'Writing') return 'text-amber-700 dark:text-amber-300';
	return 'text-muted-foreground';
}

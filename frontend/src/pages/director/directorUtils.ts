import type { DirectorCycle, DirectorProfileInput } from '../../api/types.ts';

import { textareaClass as sharedTextareaClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';

export const textareaClass = sharedTextareaClass;
// `sectionTitleClass`/`sectionDescClass` were deleted here. They were a second declaration of the
// card-title scale, which is why the Director page ran two heading sizes across four peer sections;
// every section on this page now goes through CardHeader.

// `riskTone` moved to lib/directorConstants.ts alongside a matching `riskLabel`. The Dashboard
// rendered the same suggestion records and had grown its own copy of the mapping, and the two had
// already drifted on `LOW`.

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
	if (label === 'Ready') return toneText.emerald;
	if (label === 'Pending' || label === 'Writing') return toneText.amber;
	return toneText.neutral;
}

// `humanizeEnum` moved to lib/formatters.ts. The suggestion queue was not the only surface printing
// raw SCREAMING_SNAKE or snake_case as a label, so it stopped being a Director-local concern.

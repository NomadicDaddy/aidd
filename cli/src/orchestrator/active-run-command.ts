import type { RunPlan } from 'aidd-shared/plan/types';

const canonicalReplayFlags = new Set(['--project-dir', '--cli', '--model', '--reasoning-effort']);

function stripCanonicalReplayFlags(argv: readonly string[]): string[] {
	const stripped: string[] = [];
	for (let index = 0; index < argv.length; index++) {
		const token = argv[index] ?? '';
		const equals = token.startsWith('--') ? token.indexOf('=') : -1;
		const flag = equals === -1 ? token : token.slice(0, equals);
		if (canonicalReplayFlags.has(flag)) {
			if (equals === -1) index++;
			continue;
		}
		stripped.push(token);
	}
	return stripped;
}

export function buildActiveRunCommandArgs(plan: RunPlan, argv: readonly string[]): string[] {
	const args = ['aidd', '--project-dir', plan.projectDir, ...stripCanonicalReplayFlags(argv)];
	args.push('--cli', plan.backend);
	if (plan.model) args.push('--model', plan.model);
	if (plan.reasoningEffort) args.push('--reasoning-effort', plan.reasoningEffort);
	return args;
}

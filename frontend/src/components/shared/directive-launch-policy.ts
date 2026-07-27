export const DIRECTIVE_PROMPT_SAFETY_NOTICE =
	'Do not include secrets. Directive text is stored in run history and process arguments.';

interface DirectiveLaunchState {
	isPending: boolean;
	projectDir: string;
	prompt: string;
}

interface DirectiveSubmitKey {
	ctrlKey: boolean;
	key: string;
	metaKey: boolean;
}

export function canLaunchDirective(state: DirectiveLaunchState): boolean {
	return state.projectDir !== '' && state.prompt.trim().length > 0 && !state.isPending;
}

export function isDirectiveSubmitShortcut(event: DirectiveSubmitKey): boolean {
	return event.key === 'Enter' && (event.ctrlKey || event.metaKey);
}

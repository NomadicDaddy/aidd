import { backendOptions } from './backends.ts';

export interface ExecutionIdentity {
	backend?: null | string | undefined;
	model?: null | string | undefined;
	provider?: null | string | undefined;
	reasoningEffort?: null | string | undefined;
}

export type ExecutionIdentityKind = 'backend' | 'model' | 'reasoning';

export interface ExecutionIdentityItem {
	kind: ExecutionIdentityKind;
	label: string;
}

/**
 * Every backend an execution identity can name, including the in-process `direct` client.
 *
 * It lives beside the model and reasoning catalogs rather than in the Badge Lab page, because a
 * page that also exports a component cannot export a constant without breaking fast refresh.
 */
export const executionIdentityCliCatalog = [
	...backendOptions.map(({ value }) => value),
	'direct',
] as const;

export const executionIdentityModelCatalog = [
	'claude-fable-5',
	'claude-opus-5',
	'glm-5.2',
	'gpt-5.6-sol',
	'gpt-oss:20b',
	'openai/gpt-oss-20b',
	'zai-coding-plan/glm-5.2',
] as const;

export const executionIdentityReasoningCatalog = [
	'none',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
] as const;

export function cleanIdentityValue(value: null | string | undefined): string | undefined {
	const cleaned = value?.trim();
	return cleaned ? cleaned : undefined;
}

export function executionIdentityItems(identity: ExecutionIdentity): ExecutionIdentityItem[] {
	const items: ExecutionIdentityItem[] = [];
	const backend = cleanIdentityValue(identity.backend);
	const model = cleanIdentityValue(identity.model);
	const reasoningEffort = cleanIdentityValue(identity.reasoningEffort);
	if (backend) items.push({ kind: 'backend', label: backend });
	if (model) items.push({ kind: 'model', label: model });
	if (reasoningEffort) items.push({ kind: 'reasoning', label: reasoningEffort });
	return items;
}

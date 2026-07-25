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

export interface IdentityBadgeStyle {
	backgroundColor: string;
	color: string;
}

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

const reasoningClass: Readonly<Record<string, string>> = {
	high: 'bg-violet-700 text-white',
	low: 'bg-sky-700 text-white',
	medium: 'bg-blue-700 text-white',
	minimal: 'bg-slate-600 text-white',
	none: 'bg-neutral-600 text-white',
};

const topReasoningClass = 'bg-fuchsia-700 text-white';
const unknownReasoningClass = 'bg-neutral-600 text-white';

const topReasoningAliases = new Set([
	'extra high',
	'extra-high',
	'extra_high',
	'max',
	'maximum',
	'ultra',
	'x-high',
	'xhigh',
]);

const identityKindSalt: Readonly<Record<Exclude<ExecutionIdentityKind, 'reasoning'>, number>> = {
	backend: 47,
	model: 193,
};

const knownIdentityHue: Readonly<
	Record<Exclude<ExecutionIdentityKind, 'reasoning'>, Readonly<Record<string, number>>>
> = {
	backend: {
		'claude-code': 18,
		codex: 145,
		direct: 95,
		grok: 335,
		kilocode: 275,
		lmstudio: 305,
		native: 190,
		ollama: 45,
		openai: 165,
		opencode: 225,
	},
	model: {
		'claude-fable-5': 335,
		'claude-opus-5': 315,
		'glm-5.2': 220,
		'gpt-5.6-sol': 290,
		'gpt-oss:20b': 45,
		'openai/gpt-oss-20b': 165,
		'zai-coding-plan/glm-5.2': 240,
	},
};

function identityHue(kind: Exclude<ExecutionIdentityKind, 'reasoning'>, value: string): number {
	const knownHue = knownIdentityHue[kind][value];
	if (knownHue !== undefined) return knownHue;
	let hash = 2_166_136_261 ^ identityKindSalt[kind];
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return (hash >>> 0) % 360;
}

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

export function identityBadgeStyle(
	kind: Exclude<ExecutionIdentityKind, 'reasoning'>,
	value: string
): IdentityBadgeStyle {
	const hue = identityHue(kind, value.trim().toLowerCase());
	return {
		backgroundColor: `hsl(${hue} 68% 42%)`,
		color: hue >= 25 && hue <= 205 ? '#111827' : '#ffffff',
	};
}

export function reasoningBadgeClass(value: string): string {
	const normalized = value.trim().toLowerCase();
	if (topReasoningAliases.has(normalized)) return topReasoningClass;
	return reasoningClass[normalized] ?? unknownReasoningClass;
}

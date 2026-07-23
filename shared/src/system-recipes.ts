export const SYSTEM_RECIPE_NAMES = {
	'audit-all': 'audit (all)',
	coding: 'coding',
	'project-intake': 'project-intake',
	'project-reintake': 'project-reintake',
	'reconcile-project-artifacts': 'reconcile project artifacts',
	'remediate-audit-findings': 'remediate audit findings',
	'remediate-bugs': 'remediate bugs',
} as const;

export type SystemRecipeId = keyof typeof SYSTEM_RECIPE_NAMES;

export function isSystemRecipeId(id: string): id is SystemRecipeId {
	return Object.hasOwn(SYSTEM_RECIPE_NAMES, id);
}

export function systemRecipeName(id: string): string | undefined {
	return isSystemRecipeId(id) ? SYSTEM_RECIPE_NAMES[id] : undefined;
}

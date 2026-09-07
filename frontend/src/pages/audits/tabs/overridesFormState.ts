import type { AuditOverrideEffect } from '../../../api/types.ts';

/** How many audit effects differ between two explicit-override maps. */
export function countChangedEffects(
	left: Record<string, AuditOverrideEffect>,
	right: Record<string, AuditOverrideEffect>,
): number {
	let count = 0;
	const names = new Set([...Object.keys(left), ...Object.keys(right)]);
	for (const name of names) {
		if (left[name] !== right[name]) count += 1;
	}
	return count;
}

/**
 * The saved effects as a complete form draft: every definition present, unset ones reading
 * `default`. Seeding and discarding are the same operation from different triggers, so they share
 * this rather than each rebuilding the map.
 */
export function seedAudits(
	definitions: { name: string }[],
	saved: Record<string, AuditOverrideEffect>,
): Record<string, 'default' | AuditOverrideEffect> {
	const seeded: Record<string, 'default' | AuditOverrideEffect> = {};
	for (const definition of definitions) {
		seeded[definition.name] = saved[definition.name] ?? 'default';
	}
	return seeded;
}

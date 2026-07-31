import { type Feature } from '../features.ts';
import { detectPrettierJsonStyle, printJson } from '../json-format.ts';

/**
 * Render a feature record for disk, keeping the formatting `existing` already had. Where an app
 * commits `.aidd` in its prettier-canonical form, re-serializing at 2-space turns a one-field
 * update into a whole-file diff and leaves `check:aidd-format` non-zero. A record the project has
 * never formatted — including every record in a fresh project, where `existing` is empty — keeps
 * this module's own shape, so nothing is imposed on a project that never asked for it.
 */
export function serializeFeatureFile(feature: Feature, existing: string): string {
	const record = serializeFeatureForWrite(feature);
	const style = detectPrettierJsonStyle(existing);
	return style === null ? `${JSON.stringify(record, null, 2)}\n` : printJson(record, style);
}

export function serializeFeatureForWrite(feature: Feature): Record<string, unknown> {
	const serialized: Record<string, unknown> = {};
	const orderedKeys: (keyof Feature)[] = [
		'id',
		'title',
		'description',
		'category',
		'dependencies',
		'status',
		'passes',
		'priority',
	];
	for (const key of orderedKeys) {
		const value = feature[key];
		if (value !== undefined) serialized[key] = value;
	}
	for (const [key, value] of Object.entries(feature)) {
		if (key === 'directory' || key in serialized) continue;
		serialized[key] = value;
	}
	return serialized;
}

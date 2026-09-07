import { type Feature } from '../features.ts';
import { detectPrettierJsonStyle, printJson } from '../json-format.ts';

/**
 * Keys a Feature carries in memory that are never written to feature.json. `directory` is the
 * record's own folder name, injected on read so callers need not thread it separately; writing
 * it back would put a second, silently divergent copy of the path inside the file it names.
 *
 * Exported so a surface presenting a feature's on-disk JSON can strip exactly what this writer
 * drops, instead of maintaining a parallel guess at the list.
 */
export const NON_PERSISTED_FEATURE_KEYS: readonly string[] = ['directory'];

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
		if (NON_PERSISTED_FEATURE_KEYS.includes(key) || key in serialized) continue;
		serialized[key] = value;
	}
	return serialized;
}

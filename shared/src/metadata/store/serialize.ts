import { type Feature } from '../features.ts';

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

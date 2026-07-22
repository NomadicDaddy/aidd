import { describe, expect, test } from 'bun:test';

import type { ProjectArtifactRecord } from '../../frontend/src/api/types.ts';

import { artifactViewablePath } from '../../frontend/src/pages/projects/detail/artifactsUtils.ts';

function record(overrides: Partial<ProjectArtifactRecord> = {}): ProjectArtifactRecord {
	return {
		ageDays: 1,
		exists: true,
		freshness: 'fresh',
		label: 'spec',
		mtime: '2026-06-10T10:00:00.000Z',
		path: '.aidd/spec.md',
		severity: 'required',
		sizeBytes: 1024,
		...overrides,
	};
}

describe('artifactViewablePath', () => {
	test('allows files under .aidd/', () => {
		expect(artifactViewablePath(record())).toBe('.aidd/spec.md');
		expect(artifactViewablePath(record({ path: '.aidd/roadmap.json' }))).toBe(
			'.aidd/roadmap.json'
		);
	});

	test('allows the root CONTEXT.md', () => {
		expect(artifactViewablePath(record({ path: 'CONTEXT.md' }))).toBe('CONTEXT.md');
	});

	test('normalizes Windows separators', () => {
		expect(artifactViewablePath(record({ path: '.aidd\\spec.md' }))).toBe('.aidd/spec.md');
	});

	test('rejects other root files and non-existent artifacts', () => {
		expect(artifactViewablePath(record({ path: 'README.md' }))).toBeNull();
		expect(artifactViewablePath(record({ path: 'src/index.ts' }))).toBeNull();
		expect(artifactViewablePath(record({ exists: false }))).toBeNull();
	});
});

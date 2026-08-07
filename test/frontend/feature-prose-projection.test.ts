import type { ProjectFeature } from '../../frontend/src/api/types.ts';

import { describe, expect, test } from 'bun:test';

import { featureEditorGate } from '../../frontend/src/pages/projects/detail/featureProseEditor.ts';
import { featureMatchesSearch } from '../../frontend/src/pages/projects/detail/featuresUtils.ts';

// The client half of the project-detail payload split. The list rows are summaries now — no `spec`,
// `notes`, `affectedFiles` or `aiddReport` — which changes two things the client used to take for
// granted: what the search filter can match, and whether the spec/notes editor is safe to open.

function feature(partial: { id: string } & Partial<ProjectFeature>): ProjectFeature {
	return { status: 'backlog', ...partial };
}

describe('feature search over summary rows', () => {
	test('matches on summary, which stands where spec used to', () => {
		// `spec` was a third of a two-megabyte payload and no longer reaches the client in bulk. A
		// filter cannot match text it does not hold, so `summary` — the one-line statement of the
		// same thing — carries the search instead.
		const row = feature({
			id: 'remediation-20260806-project-detail-payload',
			summary: 'The project-detail endpoint ships every feature record in full.',
		});
		expect(featureMatchesSearch(row, 'ships every feature record')).toBeTrue();
	});

	test('still matches on the other fields a summary row carries', () => {
		const row = feature({
			auditSeverity: 'high',
			auditSource: 'FRONTEND',
			category: 'Performance',
			description: 'Returns every feature record on every project-detail page load.',
			directory: 'remediation-20260806-project-detail-payload',
			id: 'payload',
			title: 'Project detail endpoint returns the whole feature backlog',
		});
		for (const query of [
			'remediation-20260806',
			'payload',
			'whole feature backlog',
			'every project-detail page',
			'performance',
			'frontend',
			'high',
		]) {
			expect(featureMatchesSearch(row, query)).toBeTrue();
		}
	});

	test('does not claim a match on prose the row no longer carries', () => {
		// Guards the honest limitation rather than papering over it: searching the full acceptance
		// criteria now requires opening the feature. A row that matched here would mean `spec` had
		// crept back into the list payload.
		const row = feature({ id: 'payload', summary: 'Short summary.' });
		expect(featureMatchesSearch(row, 'acceptance criteria')).toBeFalse();
	});
});

describe('feature editor gate', () => {
	test('blocks the editor while the full record is still loading', () => {
		// The editor seeds its textareas from `spec` and `notes`. On a summary row both are empty,
		// so opening early and saving writes empty strings over the real content.
		const gate = featureEditorGate({ isError: false, isPending: true });
		expect(gate.disabled).toBeTrue();
		expect(gate.reason).toBe('Loading feature…');
	});

	test('blocks the editor when the record could not be fetched', () => {
		const gate = featureEditorGate({ isError: true, isPending: false });
		expect(gate.disabled).toBeTrue();
		expect(gate.reason).toBe('Feature could not be loaded');
	});

	test('opens the editor once the prose has arrived', () => {
		const gate = featureEditorGate({ isError: false, isPending: false });
		expect(gate.disabled).toBeFalse();
		expect(gate.reason).toBe('Edit spec and notes');
	});
});

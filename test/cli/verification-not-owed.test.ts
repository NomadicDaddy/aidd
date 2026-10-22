import type { SelectedWork } from 'aidd-shared/modes/types';
import type { AgentRunResult } from 'aidd-shared/orchestrator/result';

import { describe, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { FileAiddStore } from 'aidd-shared/metadata/store';

import { evaluateFeatureCompletion } from '../../cli/src/modes/coding/completion.ts';
import {
	detectBlockedVerificationAdmission,
	recordOwesLiveVerification,
} from '../../cli/src/modes/coding/verification.ts';
import { testTempDir } from '../_helpers/temp.ts';

// rollshift 05025fa (2026-10-22): a statically verified correction to .aidd/project.md was parked
// as waiting_approval because its final line repeated the run's note that live UI verification
// was blocked. Exempting by wording leaked real admissions (Morticia on 5e5d08e), so the record
// decides: no live check is owed only when every affected file is documentation and no spec
// clause names one (Morticia #19035, Roger #19037).

const ID = 'record-under-test';
const ROLLSHIFT_LINE =
	'No application source changed, so no browser pass is owed — consistent with the run context note that live UI verification is blocked this iteration.';

async function storeWithRecord(name: string, affectedFiles: string[] | undefined, spec: string) {
	const projectDir = join(await testTempDir(`not-owed-${name}`), name);
	await mkdir(join(projectDir, '.aidd', 'features'), { recursive: true });
	const store = new FileAiddStore(projectDir);
	// As the agent leaves it when it claims completion; the evaluation decides whether that holds.
	await store.writeFeature({
		id: ID,
		passes: true,
		spec,
		status: 'completed',
		...(affectedFiles === undefined ? {} : { affectedFiles }),
	});
	return store;
}

const STATIC_SPEC = '1. Verify .aidd/project.md no longer names the stale engine.';

describe('live verification is owed by the record, not the wording', () => {
	test('a documentation-only record with a static spec owes no live check', async () => {
		for (const files of [
			['.aidd/project.md'],
			['docs/guide.md', 'README.md'],
			['.aidd\\features\\x\\feature.json'],
		]) {
			const store = await storeWithRecord('doc', files, STATIC_SPEC);
			expect(await recordOwesLiveVerification(store, ID, undefined)).toBe(false);
		}
	});

	test('executable, product or unlisted files still owe it', async () => {
		for (const files of [
			['src/boot.ts'],
			['docs/example.ts'],
			['.aidd/scripts/check.ts'],
			['posts/2026/10/22.md'],
			['.aidd/project.md', 'src/store.ts'],
			[],
			undefined,
		]) {
			const store = await storeWithRecord('src', files, STATIC_SPEC);
			expect(await recordOwesLiveVerification(store, ID, undefined)).toBe(true);
		}
	});

	test('a documentation-only record whose spec names a live check owes it', async () => {
		const store = await storeWithRecord(
			'live-spec',
			['docs/guide.md'],
			'1. Verify the guide renders in the browser with the new heading.',
		);
		expect(await recordOwesLiveVerification(store, ID, undefined)).toBe(true);
	});

	// Morticia on c3dfb77: the agent can edit its own record mid-run, so the copy it was selected
	// with counts too, and either copy owing wins.
	test('trimming the record mid-run earns no exemption', async () => {
		const store = await storeWithRecord('trimmed', ['.aidd/project.md'], STATIC_SPEC);
		const selected = selectedRecord(['.aidd/project.md', 'src/store.ts'], STATIC_SPEC);
		expect(await recordOwesLiveVerification(store, ID, selected)).toBe(true);
		const reworded = selectedRecord(
			['.aidd/project.md'],
			'1. Verify it renders in the browser.',
		);
		expect(await recordOwesLiveVerification(store, ID, reworded)).toBe(true);
	});

	test('a ".." segment never counts as documentation', async () => {
		const store = await storeWithRecord('dotdot', ['.aidd/../src/page.md'], STATIC_SPEC);
		expect(await recordOwesLiveVerification(store, ID, undefined)).toBe(true);
	});

	test('the detector still reads every admission, mixed lines included', () => {
		const detect = (chunk: string) =>
			detectBlockedVerificationAdmission([{ chunk, type: 'assistant_text' }]);
		for (const line of [
			ROLLSHIFT_LINE,
			'No browser check is owed — I could not verify the rendered feature.',
			'No manual check is needed, I could not verify the UI change.',
		]) {
			expect(detect(line)).toBeDefined();
		}
	});
});

// The run's selected work carries the whole record as it was selected.
function selectedRecord(affectedFiles: string[], spec: string): SelectedWork {
	return {
		data: { affectedFiles, id: ID, spec, status: 'in_progress' },
		description: 'Selected',
		id: ID,
		kind: 'feature',
	};
}

function completedWith(line: string, selected: SelectedWork): AgentRunResult {
	return {
		events: [
			{
				chunk: `${line}\n\nAIDD_RESULT: {"featureId":"${ID}","status":"completed","passes":true}`,
				type: 'assistant_text',
			},
		],
		exitCode: 0,
		filesModified: [],
		selectedWork: selected,
		structuredResult: { featureId: ID, passes: true, status: 'completed' },
		transcript: '',
	};
}

describe('completion path for a blocked-verification admission', () => {
	test('a static project.md record completes', async () => {
		const store = await storeWithRecord('complete', ['.aidd/project.md'], STATIC_SPEC);
		const selected = selectedRecord(['.aidd/project.md'], STATIC_SPEC);
		const evaluation = await evaluateFeatureCompletion(
			store,
			completedWith(ROLLSHIFT_LINE, selected),
		);
		expect(evaluation.verificationBlockedParked).toBe(false);
		expect(evaluation.shouldComplete).toBe(true);
	});

	test('a docs-path executable parks', async () => {
		const store = await storeWithRecord('script', ['docs/example.ts'], STATIC_SPEC);
		const selected = selectedRecord(['docs/example.ts'], STATIC_SPEC);
		const evaluation = await evaluateFeatureCompletion(
			store,
			completedWith(ROLLSHIFT_LINE, selected),
		);
		expect(evaluation.verificationBlockedParked).toBe(true);
		expect(evaluation.shouldComplete).toBe(false);
	});

	test('a documentation-only record that names a live check parks', async () => {
		const liveSpec = '1. Verify the guide renders in the browser.';
		const store = await storeWithRecord('live', ['docs/guide.md'], liveSpec);
		const selected = selectedRecord(['docs/guide.md'], liveSpec);
		const evaluation = await evaluateFeatureCompletion(
			store,
			completedWith(ROLLSHIFT_LINE, selected),
		);
		expect(evaluation.verificationBlockedParked).toBe(true);
		expect(evaluation.shouldComplete).toBe(false);
	});
});

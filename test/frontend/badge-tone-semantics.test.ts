import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { featurePrioritiesAreUniform } from '../../frontend/src/pages/projects/detail/featuresUtils.ts';

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');

async function source(file: string): Promise<string> {
	return await readFile(resolve(FRONTEND_SRC, file), 'utf8');
}

describe('badge tone semantics', () => {
	test('keeps advisory run badges distinct from successful outcomes', async () => {
		const badges = await source(
			'components/shared/local-aidd-history/LocalRunResultBadges.tsx',
		);

		expect(badges).toContain('<Badge tone="amber">Ledger out of sync</Badge>');
		expect(badges).toContain('<Badge tone="amber">Concurrent source changes</Badge>');
		expect(badges).not.toContain('<Badge tone="teal">Ledger out of sync</Badge>');
	});

	test('keeps inert artifact and draft states neutral', async () => {
		const artifact = await source('pages/projects/detail/ArtifactRow.tsx');
		const interview = await source('pages/projects/detail/InterviewQuestionRow.tsx');

		expect(artifact).toContain('<Badge tone="neutral">skipped</Badge>');
		expect(artifact).toMatch(
			/skipped \? \([\s\S]*?<Badge tone="neutral">skipped<\/Badge>[\s\S]*?\) : \([\s\S]*?<Badge tone=\{status\.tone\}>/u,
		);
		expect(interview).toContain('<Badge tone="neutral">Draft</Badge>');
	});

	test('de-emphasizes a priority only when every visible row shares it', () => {
		expect(featurePrioritiesAreUniform([{ priority: 1 }, { priority: 1 }])).toBe(true);
		expect(featurePrioritiesAreUniform([{ priority: 1 }, { priority: 2 }])).toBe(false);
		expect(featurePrioritiesAreUniform([{ priority: 1 }])).toBe(false);
		expect(featurePrioritiesAreUniform([{ priority: 1 }, {}])).toBe(false);
	});
});

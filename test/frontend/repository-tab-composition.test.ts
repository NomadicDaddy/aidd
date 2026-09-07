import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DETAIL_ROOT = resolve(import.meta.dir, '../../frontend/src/pages/projects/detail');

async function detail(file: string): Promise<string> {
	return await readFile(resolve(DETAIL_ROOT, file), 'utf8');
}

describe('repository tab composition', () => {
	test('spends wide space with two measured statistics columns and shared inset surfaces', async () => {
		const source = await detail('RepositoryInfoCard.tsx');

		expect(source).toContain(
			'@min-[61rem]:max-w-none @min-[61rem]:grid-cols-[minmax(0,48rem)_minmax(0,48rem)]',
		);
		expect(source.match(/max-w-\[(?:32|48)rem\]/gu)?.length ?? 0).toBeGreaterThanOrEqual(5);
		expect(source.match(/variant="sunken"/gu)?.length ?? 0).toBe(2);
		expect(source).not.toContain('bg-muted/70');
	});

	test('uses shared counted and uncounted subsection headers for repository card groups', async () => {
		const info = await detail('RepositoryInfoCard.tsx');
		const panelHeading = await detail('RepositoryPanelHeading.tsx');
		const refs = await detail('RepositoryRefsCard.tsx');

		expect(info).toContain('title="Top contributors"');
		expect(info).toContain('title="Languages"');
		expect(info).toContain('<RepositoryPanelHeading');
		expect(info).not.toContain('<h4');
		expect(panelHeading).toContain('description?: string | undefined;');
		expect(panelHeading).toContain('title: string;');
		expect(panelHeading).toContain('count === undefined ? undefined');
		expect(panelHeading).toContain('<Badge tone="neutral">{count.toLocaleString()}</Badge>');
		expect(panelHeading).toContain('level="subsection"');
		expect(panelHeading).toContain('headingLevel={4}');
		expect(refs).toContain('<RepositoryPanelHeading');
		expect(refs).not.toContain('<h4');
	});

	test('keeps ref values with their labels and leaves git state to the project strip', async () => {
		const refs = await detail('RepositoryRefsCard.tsx');
		const workingTree = await detail('workingTree/WorkingTreeCard.tsx');

		expect(refs).not.toContain('justify-between');
		expect(refs).toContain('grid min-w-0 grid-cols-[4rem_minmax(0,1fr)_minmax(7rem,auto)]');
		expect(refs.match(/flex min-w-0 items-center gap-2/gu)?.length ?? 0).toBeGreaterThanOrEqual(
			2,
		);
		expect(workingTree).not.toContain('GitStatusBadge');
		expect(workingTree).not.toContain('The working tree is clean');
		expect(workingTree).toContain('`${status.staged} staged`');
		expect(workingTree).toContain('`${status.unstaged} unstaged`');
		expect(workingTree).toContain('`${status.untracked} untracked`');
	});

	test('renders tiny language shares as a categorical long-tail mark', async () => {
		const info = await detail('RepositoryInfoCard.tsx');

		expect(info).toContain('const isLongTail = language.lines > 0 && share < 2;');
		expect(info).toContain("data-scale={isLongTail ? 'long-tail' : 'linear'}");
		expect(info).toContain("isLongTail ? { width: '0.75rem' }");
		expect(info).not.toContain('Math.max(share, 0.5)');
	});
});

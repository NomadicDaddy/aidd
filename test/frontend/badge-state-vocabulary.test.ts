import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import type { RunRecord } from '../../frontend/src/api/types.ts';

import { milestoneStatePresentation } from '../../frontend/src/pages/projects/projects-list-visuals.ts';
import {
	installedTone,
	sourceControlInstalledLabel,
} from '../../frontend/src/pages/settings/sourceControlTone.ts';
import { classifyRunRecord } from '../../frontend/src/pages/runs/runsUtils.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const FRONTEND_SRC = join(FRONTEND_ROOT, 'src');

function read(path: string): Promise<string> {
	return Bun.file(join(FRONTEND_SRC, ...path.split('/'))).text();
}

function renderCredentialBadge(
	configured: boolean,
	context?: 'configuration' | 'web-store',
	pendingAction?: 'clear' | 'replace' | 'set',
): string {
	const props = {
		configured,
		...(context ? { context } : {}),
		...(pendingAction ? { pendingAction } : {}),
	};
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { CredentialBadge } from './src/components/shared/CredentialBadge.tsx';",
		`console.log(renderToStaticMarkup(createElement(CredentialBadge, ${JSON.stringify(props)})));`,
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('badge state vocabulary', () => {
	test('keeps configured state and browser-storage state as separate canonical questions', () => {
		expect(renderCredentialBadge(true)).toContain('>Configured</span>');
		expect(renderCredentialBadge(false)).toContain('>Not set</span>');
		expect(renderCredentialBadge(true, 'web-store')).toContain(
			'>Stored in this browser</span>',
		);
		expect(renderCredentialBadge(false, 'web-store')).toContain(
			'>None stored in this browser</span>',
		);
	});

	test('labels pending credential mutations without exposing their value', () => {
		expect(renderCredentialBadge(false, undefined, 'clear')).toContain(
			'>Will clear on save</span>',
		);
		expect(renderCredentialBadge(true, undefined, 'replace')).toContain(
			'>Will replace on save</span>',
		);
		expect(renderCredentialBadge(true, undefined, 'set')).toContain(
			'>Will configure on save</span>',
		);
	});

	test('labels every milestone workflow state from one presentation helper', () => {
		const complete = { completed: 2, name: 'v1', total: 2 };
		const current = { completed: 1, name: 'v2', total: 2 };
		const upcoming = { completed: 0, name: 'v3', total: 2 };

		expect(milestoneStatePresentation(complete, 'v2')).toEqual({
			label: 'complete',
			tone: 'emerald',
		});
		expect(milestoneStatePresentation(current, 'v2')).toEqual({
			label: 'current',
			tone: 'teal',
		});
		expect(milestoneStatePresentation(upcoming, 'v2')).toEqual({
			label: 'upcoming',
			tone: 'neutral',
		});
	});

	test('keeps source-control installation visible when authentication fails', () => {
		expect(sourceControlInstalledLabel('available')).toBe('Available');
		expect(sourceControlInstalledLabel('unavailable')).toBe('Unavailable');
		expect(installedTone.available).toBe('emerald');

		const killed = classifyRunRecord({
			exitCode: null,
			status: 'killed',
			stopReason: 'killed',
			summary: null,
		} as RunRecord);
		expect(killed.label).toBe('Killed');
		expect(killed.tone).not.toBe('red');
	});

	test('wires each affected surface to its stable dimension', async () => {
		const [auth, badge, gitRow, milestones, profile, recipe, repository, runs, settings] =
			await Promise.all([
				read('components/shared/AuthTokenDialog.tsx'),
				read('components/ui/badge.tsx'),
				read('pages/projects/ProjectTableRow.tsx'),
				read('pages/projects/detail/MilestonesTable.tsx'),
				read('pages/projects/detail/profile/FacetCard.tsx'),
				read('pages/recipes/StepOverviewCard.tsx'),
				read('pages/projects/detail/RepositoryRefsCard.tsx'),
				read('pages/projects/detail/ActiveRunsPanel.tsx'),
				read('pages/settings/SettingsStatusPanels.tsx'),
			]);

		expect(auth).toContain('context="web-store"');
		expect(auth).toContain('label="Access token"');
		expect(badge).toContain('font-sans tracking-normal');
		expect(gitRow).toContain('<GitStatusBadge className="max-w-full"');
		expect(milestones.match(/<MilestoneStateBadge/gu)).toHaveLength(2);
		expect(profile).toContain('aria-describedby={descriptionId}');
		expect(profile).not.toContain('title="Selecting this value');
		expect(recipe).toContain('<Badge tone="neutral">on failure: {step.onFailure}</Badge>');
		expect(repository).not.toContain('<Badge casing="title" tone="neutral">\n\t\t\t\t\tmain');
		expect(runs.match(/<RunStatusBadge run=\{run\}/gu)).toHaveLength(2);
		expect(runs).toContain('const outcome = classifyRunRecord(run);');
		expect(settings).toContain('sourceControlInstalledLabel(item.status)');
		expect(settings).toContain("authenticated ? 'Signed in' : 'Signed out'");
		expect(settings).not.toContain("'Not authenticated'");
	});
});

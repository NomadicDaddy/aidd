import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ProjectImportCandidate } from '../../frontend/src/api/types/projects/operations.ts';

import {
	candidateRoots,
	filterImportCandidates,
} from '../../frontend/src/pages/projects/projectImportCandidates.ts';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function candidate(
	id: string,
	root: string,
	signals: ProjectImportCandidate['signals'],
): ProjectImportCandidate {
	return {
		canImport: true,
		id,
		name: id,
		path: `${root}\\${id}`,
		reason: null,
		root,
		signals,
	};
}

function read(relativePath: string): Promise<string> {
	return readFile(join(frontendSource, ...relativePath.split('/')), 'utf8');
}

const candidates = [
	candidate('alpha', 'D:\\applications', { aidd: false, git: true, packageJson: true }),
	candidate('bravo', 'D:\\public', { aidd: true, git: true, packageJson: false }),
	candidate('charlie', 'D:\\applications', {
		aidd: false,
		git: false,
		packageJson: false,
	}),
];

describe('project intake workflow clarity', () => {
	test('filters candidates by query, configured root, and discovery signal', () => {
		expect(candidateRoots(candidates)).toEqual(['D:\\applications', 'D:\\public']);
		expect(
			filterImportCandidates(candidates, {
				query: 'PUBLIC',
				root: '',
				signal: 'all',
			}).map((entry) => entry.id),
		).toEqual(['bravo']);
		expect(
			filterImportCandidates(candidates, {
				query: '',
				root: 'D:\\applications',
				signal: 'packageJson',
			}).map((entry) => entry.id),
		).toEqual(['alpha']);
		expect(
			filterImportCandidates(candidates, {
				query: '',
				root: '',
				signal: 'directory',
			}).map((entry) => entry.id),
		).toEqual(['charlie']);
	});

	test('keeps creation, candidate inventory, action help, and catalog focus explicit', async () => {
		const [
			candidatePreview,
			candidateRow,
			createLane,
			ingestLane,
			intakePanel,
			projectsPage,
			segmentedControl,
		] = await Promise.all([
			read('pages/projects/CandidateIntakePreview.tsx'),
			read('pages/projects/IngestCandidateRow.tsx'),
			read('pages/projects/ProjectCreateLane.tsx'),
			read('pages/projects/ProjectIngestLane.tsx'),
			read('pages/projects/ProjectIntakePanel.tsx'),
			read('pages/projects/ProjectsPage.tsx'),
			read('components/ui/segmented-control.tsx'),
		]);

		expect(createLane).not.toContain('contentRailClass.bounded');
		expect(intakePanel).not.toContain('contentRailClass');
		expect(intakePanel).toContain('<TabList<IntakeLane>');
		expect(intakePanel).toContain('<TabPanel activeTab={lane}');
		expect(ingestLane).toContain('ProjectIngestFilters');
		expect(ingestLane).toContain('<LaunchTargetControl');
		expect(ingestLane).toContain("action === 'ingest'");
		expect(ingestLane).toContain('launchTarget,');
		expect(ingestLane).toContain('@min-[60rem]:grid-cols-2');
		expect(ingestLane).toContain('<FieldRow group label="Selection">');
		expect(ingestLane).toContain('<FieldRow group label="Action">');
		expect(ingestLane).toContain('readoutSuffix={');
		expect(intakePanel).toContain(
			'className={`mb-4 text-sm text-muted-foreground ${proseMeasureClass}`}',
		);
		expect(intakePanel).toContain('{LANE_COPY[lane].description}');
		expect(ingestLane).toContain('ariaDescribedBy={actionHelpId}');
		expect(ingestLane).toContain('aria-describedby={actionHelpId}');
		expect(ingestLane).toContain('No pipeline or Run is launched.');
		expect(ingestLane).toContain('Select all filtered');
		expect(ingestLane).toContain('Clear selection');
		expect(projectsPage).toContain('Project catalog paused while intake is open.');
		expect(projectsPage).not.toContain('<Card className="py-3');
		expect(createLane).toMatch(/grid gap-3 sm:grid-cols-2[\s\S]*GithubRepoField/);
		expect(await read('pages/projects/ProjectIngestFilters.tsx')).toContain(
			'actionLayout="stacked"',
		);
		expect(await read('pages/projects/ProjectIngestFilters.tsx')).toContain(
			'columns="@min-[36rem]:grid-cols-2 @min-[48rem]:grid-cols-',
		);
		expect(candidateRow).toContain('aria-label={`Select ${candidate.name}`}');
		expect(candidateRow).toContain("aria-label={`${previewOpen ? 'Hide' : 'Preview'}");
		expect(candidatePreview).toContain('<dl className="grid gap-x-3 gap-y-1');
		expect(candidatePreview).toContain('<dt className={microLabelClass}>Likely phase</dt>');
		expect(projectsPage).toContain('data-project-intake-motion');
		expect(projectsPage).toContain(
			'const pageRail = intakeLane === null ? PAGE_RAIL : pageRailByContentType.workflow;',
		);
		expect(projectsPage).toContain('rail={pageRail}');
		expect(segmentedControl).toContain(
			'group/segments relative inline-flex max-w-full min-w-0 self-start',
		);
		expect(segmentedControl).toContain('max-sm:flex max-sm:w-full');
		expect(segmentedControl).not.toContain('flex w-full max-w-full');
		const tabs = await read('components/ui/tabs.tsx');
		expect(tabs).toContain("selectionStyle === 'subtle'");
		expect(tabs).toContain('border-accent bg-accent-muted text-accent-muted-foreground');
	});
});

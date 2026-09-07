import type { Feature } from 'aidd-shared/metadata/features';

import { FileAiddStore } from 'aidd-shared/metadata/store';
import { join } from 'node:path';

import type {
	ProjectReportEntryDto,
	ProjectReportsResponseDto,
	ProjectReportSubmitDto,
} from '../types.ts';

import { recordDataMovement } from './dataMovementTrace.ts';
import { HttpError } from './errors.ts';
import { commitFiles } from './git/commitFiles.ts';
import { formatFiles } from './prettierFormat.ts';
import {
	classifyReport,
	REPORT_SOURCE,
	type ReportFeatureMetadata,
	slugFromDescription,
	titleFromDescription,
} from './projectReports/classification.ts';
import {
	buildNotes,
	buildSpec,
	reportEntryFromFeature,
	uniqueFeatureId,
} from './projectReports/featureMapping.ts';
import {
	milestoneForReportFeature,
	readRoadmapIfUsable,
} from './projectReports/roadmapMilestones.ts';

export async function listProjectReports(projectDir: string): Promise<ProjectReportsResponseDto> {
	const store = new FileAiddStore(projectDir);
	const bugs = (await store.listFeatures({ includeAudit: true }))
		.map(reportEntryFromFeature)
		.filter((entry): entry is ProjectReportEntryDto => entry !== null)
		.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
	const lastUpdated = bugs.at(-1)?.createdAt ?? null;
	return { bugs, lastUpdated };
}

// Concurrent submissions to the same project would otherwise race on the roadmap.json
// read-modify-write, `uniqueFeatureId`, and the git index lock. Serialize each project's
// submissions through a tail-chained promise; different projects stay independent.
const projectLocks = new Map<string, Promise<unknown>>();

function withProjectLock<T>(projectDir: string, task: () => Promise<T>): Promise<T> {
	const previous = projectLocks.get(projectDir) ?? Promise.resolve();
	const result = previous.then(() => task());
	const tail = result.then(
		() => undefined,
		() => undefined,
	);
	projectLocks.set(projectDir, tail);
	void tail.then(() => {
		if (projectLocks.get(projectDir) === tail) projectLocks.delete(projectDir);
	});
	return result;
}

export async function submitProjectReport(
	projectDir: string,
	report: ProjectReportSubmitDto,
): Promise<ProjectReportEntryDto> {
	const description = report.description.trim();

	if (description.length === 0) {
		throw new HttpError('Report description is required', 400);
	}

	return withProjectLock(projectDir, () => createReportFeature(projectDir, report, description));
}

async function createReportFeature(
	projectDir: string,
	report: ProjectReportSubmitDto,
	description: string,
): Promise<ProjectReportEntryDto> {
	const store = new FileAiddStore(projectDir);
	const [roadmap, existingFeatures] = await Promise.all([
		readRoadmapIfUsable(store),
		store.listFeatures({ includeAudit: true }),
	]);
	const createdAt = new Date().toISOString();
	const classification = classifyReport({ ...report, description });
	const slug = slugFromDescription(description);
	const dateStamp = createdAt.slice(0, 10).replaceAll('-', '');
	const baseId = classification.featureKind === 'bug' ? `remediation-${dateStamp}-${slug}` : slug;
	const featureId = await uniqueFeatureId(store, baseId);
	const reportFeatureMetadata: ReportFeatureMetadata = {
		classificationReason: classification.reason,
		createdAt,
		createdFeatureKind: classification.featureKind,
		originalKind: report.kind,
		reportedBy: {
			username: 'aidd-web',
		},
		source: REPORT_SOURCE,
	};
	if (report.metadata) reportFeatureMetadata.metadata = report.metadata;

	const feature: Feature = {
		aiddReport: reportFeatureMetadata,
		category: 'UI',
		dependencies: [],
		description,
		id: featureId,
		notes: buildNotes(reportFeatureMetadata),
		passes: false,
		priority: 3,
		spec: buildSpec(description, report.metadata),
		status: 'backlog',
		title: titleFromDescription(description),
	};

	const milestone =
		roadmap === null
			? null
			: milestoneForReportFeature(roadmap, existingFeatures, classification.featureKind);
	const roadmapWritten = roadmap !== null && milestone !== null;
	if (roadmap !== null && milestone !== null) {
		await store.writeRoadmap({
			...roadmap,
			features: {
				...roadmap.features,
				[featureId]: {
					...(roadmap.features[featureId] ?? {}),
					milestone,
				},
			},
		});
		recordDataMovement({
			category: 'metadata',
			operation: 'report.roadmap.write',
			status: 'success',
			summary: { featureId, milestone },
			target: join(store.metadataDir, 'roadmap.json'),
		});
	}
	await store.writeFeature(feature);
	recordDataMovement({
		category: 'metadata',
		operation: 'report.feature.write',
		status: 'success',
		summary: { featureId, kind: classification.featureKind, originalKind: report.kind },
		target: join(store.metadataDir, 'features', featureId, 'feature.json'),
	});

	// Format the generated files to the project's prettier-canonical form, then commit the pair as
	// one bundle. Both steps are best-effort: the metadata is already persisted above, so a failure
	// here must not fail the submission — it just leaves the files for a later manual commit.
	const bundle = [join(store.metadataDir, 'features', featureId, 'feature.json')];
	if (roadmapWritten) bundle.push(join(store.metadataDir, 'roadmap.json'));
	await formatFiles(bundle);
	const noun = classification.featureKind === 'bug' ? 'remediation' : 'feature';
	await commitFiles(projectDir, bundle, `chore(aidd): add ${noun} ${featureId} from web report`);

	const entry = reportEntryFromFeature({ ...feature, directory: featureId });
	if (!entry) {
		throw new HttpError('Could not read created report feature', 500);
	}
	return entry;
}

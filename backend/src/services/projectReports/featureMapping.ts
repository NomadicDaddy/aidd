import type { Feature } from 'aidd-shared/metadata/features';

import { type FileAiddStore } from 'aidd-shared/metadata/store';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	ProjectReportEntryDto,
	ProjectReportMetadataDto,
	ProjectReportStatus,
} from '../../types.ts';

import { HttpError } from '../errors.ts';
import { isObject, REPORT_SOURCE, type ReportFeatureMetadata } from './classification.ts';

export async function featureExists(store: FileAiddStore, featureId: string): Promise<boolean> {
	try {
		await stat(join(store.metadataDir, 'features', featureId, 'feature.json'));
		return true;
	} catch (err) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
			return false;
		}
		throw err;
	}
}

export async function uniqueFeatureId(store: FileAiddStore, baseId: string): Promise<string> {
	if (!(await featureExists(store, baseId))) return baseId;

	for (let attempt = 0; attempt < 10; attempt++) {
		const candidate = `${baseId}-${randomUUID().slice(0, 8)}`;
		if (!(await featureExists(store, candidate))) return candidate;
	}

	throw new HttpError('Could not generate a unique feature id for report submission', 500);
}

function reportStatusFromFeature(feature: Feature): ProjectReportStatus {
	if (feature.status === 'completed' || feature.passes === true) return 'resolved';
	if (feature.status === 'in_progress') return 'in_progress';
	if (feature.status === 'waiting_approval') return 'open';
	return 'open';
}

function reportMetadataFromFeature(feature: Feature): null | ReportFeatureMetadata {
	const metadata = feature.aiddReport;
	if (!isObject(metadata)) return null;
	if (metadata.source !== REPORT_SOURCE) return null;
	if (
		(metadata.originalKind !== 'bug' && metadata.originalKind !== 'feature') ||
		(metadata.createdFeatureKind !== 'bug' && metadata.createdFeatureKind !== 'feature')
	) {
		return null;
	}
	if (
		typeof metadata.createdAt !== 'string' ||
		typeof metadata.classificationReason !== 'string'
	) {
		return null;
	}

	const reportMetadata: ReportFeatureMetadata = {
		classificationReason: metadata.classificationReason,
		createdAt: metadata.createdAt,
		createdFeatureKind: metadata.createdFeatureKind,
		originalKind: metadata.originalKind,
		reportedBy: {
			username:
				isObject(metadata.reportedBy) && typeof metadata.reportedBy.username === 'string'
					? metadata.reportedBy.username
					: 'aidd-web',
		},
		source: REPORT_SOURCE,
	};
	if (isObject(metadata.metadata)) {
		reportMetadata.metadata = metadata.metadata as ProjectReportMetadataDto;
	}
	return reportMetadata;
}

export function reportEntryFromFeature(feature: Feature): null | ProjectReportEntryDto {
	const reportMetadata = reportMetadataFromFeature(feature);
	if (!reportMetadata) return null;

	const featureDirectory = feature.directory ?? feature.id;
	const entry: ProjectReportEntryDto = {
		classificationReason: reportMetadata.classificationReason,
		createdAt: reportMetadata.createdAt,
		description: typeof feature.description === 'string' ? feature.description : '',
		featureDirectory,
		featureId: feature.id,
		id: feature.id,
		kind: reportMetadata.createdFeatureKind,
		reportedBy: reportMetadata.reportedBy,
		status: reportStatusFromFeature(feature),
	};
	if (reportMetadata.metadata) entry.metadata = reportMetadata.metadata;
	return entry;
}

export function buildNotes(report: ReportFeatureMetadata): string[] {
	const notes = [
		`Submitted via aidd web report at ${report.createdAt}.`,
		`Original kind: ${report.originalKind}; created as: ${report.createdFeatureKind}.`,
		`Classification: ${report.classificationReason}`,
		`Reporter: ${report.reportedBy.username}.`,
	];
	if (report.metadata?.pathname) notes.push(`Path: ${report.metadata.pathname}.`);
	if (report.metadata?.url) notes.push(`URL: ${report.metadata.url}.`);
	if (report.metadata?.viewport) {
		notes.push(
			`Viewport: ${report.metadata.viewport.width}x${report.metadata.viewport.height}.`
		);
	}
	if (report.metadata?.userAgent) notes.push(`User agent: ${report.metadata.userAgent}.`);
	return notes;
}

export function buildSpec(
	description: string,
	metadata: ProjectReportMetadataDto | undefined
): string {
	const route = metadata?.pathname;
	const locationClause = route ? ` on ${route}` : '';
	return [
		`1. Verify the submitted report is addressed${locationClause}: ${description}`,
		'2. Verify the behavior is covered through the existing project UI or command flow without requiring a separate bugs.json ingestion step.',
		'3. Verify `bun run start -- --project-dir . --check-features` passes after the resulting feature is completed.',
	].join('\n');
}

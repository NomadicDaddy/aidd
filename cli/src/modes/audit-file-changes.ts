import { auditReportPath } from 'aidd-shared/metadata/audit-freshness';
import { metadataPath } from 'aidd-shared/metadata/paths';
import { readFile, stat } from 'node:fs/promises';

export interface ModeFileChanges {
	modeFilesCreated: string[];
	modeFilesEdited: string[];
}

export function createModeFileChanges(): ModeFileChanges {
	return { modeFilesCreated: [], modeFilesEdited: [] };
}

export function recordAuditFeatureCreated(
	changes: ModeFileChanges,
	projectDir: string,
	featureId: string,
): void {
	changes.modeFilesCreated.push(metadataPath(projectDir, 'features', featureId, 'feature.json'));
}

export async function recordAuditReportWrite(
	changes: ModeFileChanges,
	projectDir: string,
	auditName: string,
	writeReport: (timestamp: Date) => Promise<string>,
): Promise<string> {
	const reportTimestamp = new Date();
	const reportExistsBefore = await pathExists(
		auditReportPath(projectDir, auditName, reportTimestamp),
	);
	const reportPath = await writeReport(reportTimestamp);
	(reportExistsBefore ? changes.modeFilesEdited : changes.modeFilesCreated).push(reportPath);
	return reportPath;
}

// Roadmap writes happen inside store.writeFeature (the assignment invariant), which
// silently skips when roadmap.json is absent or unreadable — so classify by observed
// content change rather than inferring one from finding counts.
export async function snapshotRoadmap(projectDir: string): Promise<null | string> {
	return readFileOrNull(metadataPath(projectDir, 'roadmap.json'));
}

export async function recordRoadmapChangeSince(
	changes: ModeFileChanges,
	projectDir: string,
	before: null | string,
): Promise<void> {
	const roadmapPath = metadataPath(projectDir, 'roadmap.json');
	const after = await readFileOrNull(roadmapPath);
	if (after === null || after === before) return;
	(before === null ? changes.modeFilesCreated : changes.modeFilesEdited).push(roadmapPath);
}

async function pathExists(path: string): Promise<boolean> {
	return stat(path).then(
		() => true,
		() => false,
	);
}

async function readFileOrNull(path: string): Promise<null | string> {
	return readFile(path, 'utf8').catch(() => null);
}

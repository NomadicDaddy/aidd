import type {
	MaturityArtifact,
	MaturityDetail,
	ProjectArtifactRecord,
} from '../../../api/types.ts';

export type Tone = 'amber' | 'emerald' | 'neutral' | 'red' | 'teal';

export interface ArtifactViewerTarget {
	label: string;
	mtime: null | string;
	path: string;
	sizeBytes: null | number;
}

interface ArtifactInventoryEntry {
	artifact: MaturityArtifact;
	record: null | ProjectArtifactRecord;
}

interface ArtifactInventoryGroup {
	entries: ArtifactInventoryEntry[];
	id: string;
	label: string;
}

interface ArtifactInventory {
	groups: ArtifactInventoryGroup[];
	total: number;
	ungrouped: ProjectArtifactRecord[];
}

const maturityArtifactPaths = new Map<string, string>([
	['CONTEXT.md', 'CONTEXT.md'],
	['deployment.md', '.aidd/deployment.md'],
	['project.md', '.aidd/project.md'],
]);

export function formatBytes(bytes: number): string {
	if (bytes <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	const rounded = unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1);
	return `${rounded} ${units[unit]}`;
}

export function severityTone(severity: ProjectArtifactRecord['severity']): Tone {
	if (severity === 'required') return 'teal';
	return 'neutral';
}

// Mirrors the backend's readable scope (services/project/fileContent.ts): files under .aidd/
// plus the root-level CONTEXT.md. Rows outside that scope (or absent on disk) render
// without a viewer affordance instead of opening a dialog that can only fail.
export function artifactViewablePath(record: ProjectArtifactRecord): null | string {
	if (!record.exists) return null;
	const normalized = record.path.split('\\').join('/');
	if (normalized.startsWith('.aidd/') || normalized === 'CONTEXT.md') return normalized;
	return null;
}

export function artifactViewerTarget(record: ProjectArtifactRecord): ArtifactViewerTarget | null {
	const path = artifactViewablePath(record);
	if (path === null) return null;
	return {
		label: record.label,
		mtime: record.mtime,
		path,
		sizeBytes: record.sizeBytes,
	};
}

export function maturityArtifactViewerTarget(
	artifact: MaturityArtifact,
): ArtifactViewerTarget | null {
	if (
		artifact.kind !== 'fs-file' ||
		(artifact.status !== 'fresh' && artifact.status !== 'stale')
	) {
		return null;
	}
	const path = maturityArtifactPaths.get(artifact.slug);
	if (!path) return null;
	return {
		label: artifact.label,
		mtime: artifact.mtime,
		path,
		sizeBytes: null,
	};
}

export function artifactStatus(record: ProjectArtifactRecord): { label: string; tone: Tone } {
	if (!record.exists) {
		return record.severity === 'required'
			? { label: 'required missing', tone: 'red' }
			: { label: 'missing', tone: 'red' };
	}
	if (record.freshness === 'stale') return { label: 'stale', tone: 'amber' };
	return { label: 'fresh', tone: 'emerald' };
}

export function buildArtifactInventory(
	records: ProjectArtifactRecord[],
	maturity: MaturityDetail,
): ArtifactInventory {
	const recordsByLabel = new Map(records.map((record) => [record.label, record]));
	const groupedLabels = new Set<string>();
	const groups = maturity.stages
		.map((stage) => ({
			entries: stage.artifacts.map((artifact) => {
				const record = recordsByLabel.get(artifact.slug) ?? null;
				if (record) groupedLabels.add(record.label);
				return { artifact, record };
			}),
			id: stage.id,
			label: stage.label,
		}))
		.filter((group) => group.entries.length > 0);
	const ungrouped = records.filter((record) => !groupedLabels.has(record.label));
	const groupedTotal = groups.reduce((total, group) => total + group.entries.length, 0);
	return { groups, total: groupedTotal + ungrouped.length, ungrouped };
}

export function artifactInventoryCount(
	records: ProjectArtifactRecord[],
	maturity: MaturityDetail | null,
): number {
	return maturity ? buildArtifactInventory(records, maturity).total : records.length;
}

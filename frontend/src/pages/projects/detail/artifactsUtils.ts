import type { MaturityDetail, ProjectArtifactRecord } from '../../../api/types.ts';

export type Tone = 'amber' | 'cyan' | 'emerald' | 'neutral' | 'red';

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
	if (severity === 'required') return 'cyan';
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

export function artifactStatus(record: ProjectArtifactRecord): { label: string; tone: Tone } {
	if (!record.exists) {
		return record.severity === 'required'
			? { label: 'required missing', tone: 'red' }
			: { label: 'missing', tone: 'red' };
	}
	if (record.freshness === 'stale') return { label: 'stale', tone: 'amber' };
	return { label: 'fresh', tone: 'emerald' };
}

function buildSlugToStageLabel(maturity: MaturityDetail | null): Map<string, string> {
	const map = new Map<string, string>();
	if (!maturity) return map;
	for (const stage of maturity.stages) {
		for (const artifact of stage.artifacts) {
			map.set(artifact.slug, stage.label);
		}
	}
	return map;
}

export function groupRecordsByStage(
	records: ProjectArtifactRecord[],
	maturity: MaturityDetail | null
): {
	groups: Map<string, ProjectArtifactRecord[]>;
	order: string[];
	ungrouped: ProjectArtifactRecord[];
} {
	const slugMap = buildSlugToStageLabel(maturity);
	const stageOrder = maturity ? maturity.stages.map((stage) => stage.label) : [];
	const groups = new Map<string, ProjectArtifactRecord[]>();
	const ungrouped: ProjectArtifactRecord[] = [];
	for (const record of records) {
		const stageLabel = slugMap.get(record.label);
		if (stageLabel) {
			const list = groups.get(stageLabel) ?? [];
			list.push(record);
			groups.set(stageLabel, list);
		} else {
			ungrouped.push(record);
		}
	}
	return { groups, order: stageOrder, ungrouped };
}

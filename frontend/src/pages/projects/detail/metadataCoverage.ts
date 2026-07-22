import type { ProjectMetadata } from '../../../api/types.ts';

export interface MetadataCoverageSummary {
	completed: number;
	detail: string;
	label: 'Partial' | 'Required complete';
	missingLabels: string[];
	title: string;
	tone: 'amber' | 'emerald';
	total: number;
}

interface MetadataCoverageItem {
	label: string;
	present: boolean;
}

function artifactCoverageItem(metadata: ProjectMetadata): MetadataCoverageItem {
	const artifactCheck = metadata.artifactCheck;
	if (artifactCheck === null) return { label: 'artifact check', present: false };
	if (artifactCheck.summary.requiredMissing > 0) {
		return { label: 'required artifacts', present: false };
	}
	return { label: 'fresh artifacts', present: artifactCheck.summary.stale === 0 };
}

function metadataCoverageItems(metadata: ProjectMetadata): MetadataCoverageItem[] {
	return [
		{ label: 'spec', present: metadata.specUpdatedAt !== null },
		{ label: 'roadmap', present: metadata.roadmap !== null },
		artifactCoverageItem(metadata),
		{ label: 'screen map', present: metadata.screenMapRouteCount !== null },
		{ label: 'test scenarios', present: metadata.testScenariosCount !== null },
		{ label: 'profile', present: metadata.profile.source !== undefined },
	];
}

export function summarizeMetadataCoverage(metadata: ProjectMetadata): MetadataCoverageSummary {
	const items = metadataCoverageItems(metadata);
	const missingLabels = items.filter((item) => !item.present).map((item) => item.label);
	const completed = items.length - missingLabels.length;
	const complete = missingLabels.length === 0;
	return {
		completed,
		detail: `${completed}/${items.length} checks`,
		label: complete ? 'Required complete' : 'Partial',
		missingLabels,
		title: complete
			? 'All required metadata checks are satisfied.'
			: `Missing ${missingLabels.join(', ')}.`,
		tone: complete ? 'emerald' : 'amber',
		total: items.length,
	};
}

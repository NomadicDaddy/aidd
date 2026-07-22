import { licenseIdentifiers } from '../license-core/expression.ts';
import { byCodepoint } from './order.ts';
import { REGISTRY_LICENSE_NOTICES } from './registry-license-notices.ts';
import { type ThirdPartyMaterial } from './registry-types.ts';

function sourceLink(material: ThirdPartyMaterial): string {
	const version = material.sourceVersion ? ` (${material.sourceVersion})` : '';
	return `[pinned source${version}](${material.sourceUrl})`;
}

export function renderRegistrySummary(materials: readonly ThirdPartyMaterial[]): string {
	const rows = [...materials]
		.sort((left, right) => byCodepoint(left.id, right.id))
		.map((material) => {
			const paths = material.coveredPaths.map((path) => `\`${path}\``).join('<br>');
			return `| ${material.id} | ${paths} | ${material.authorOrRightsholder} | ${material.licenseExpression} | ${material.modificationStatus} | ${sourceLink(material)} |`;
		});
	return [
		'## Non-package distributed material',
		'',
		'These files are distributed from the repository rather than the npm dependency graph.',
		'Their exact-path ownership and immutable provenance are defined in',
		'[`licenses/distributed-materials.json`](./licenses/distributed-materials.json).',
		'',
		'| Material | Covered paths | Author/rightsholder | License | Status | Source |',
		'| -------- | ------------- | ------------------- | ------- | ------ | ------ |',
		...rows,
		'',
	].join('\n');
}

function materialSections(materials: readonly ThirdPartyMaterial[]): string[] {
	return [...materials]
		.sort((left, right) => byCodepoint(left.id, right.id))
		.flatMap((material) => [
			`### ${material.id}`,
			'',
			`Covered paths: ${material.coveredPaths.map((path) => `\`${path}\``).join(', ')}`,
			'',
			`Author/rightsholder: ${material.authorOrRightsholder}`,
			'',
			`License: ${material.licenseExpression}`,
			'',
			`Source: ${material.sourceUrl}`,
			'',
			`License evidence: ${material.licenseEvidenceUrl}`,
			'',
			`Modification status: ${material.modificationStatus}`,
			'',
			...(material.provenanceEvidence
				? [`Verification evidence: ${material.provenanceEvidence}`, '']
				: []),
			material.noticeText,
			'',
		]);
}

function licenseSections(materials: readonly ThirdPartyMaterial[]): string[] {
	const licenses = new Map<string, Set<string>>();
	for (const material of materials) {
		for (const license of licenseIdentifiers(material.licenseExpression)) {
			const authors = licenses.get(license) ?? new Set<string>();
			authors.add(material.authorOrRightsholder);
			licenses.set(license, authors);
		}
	}

	return [...licenses.entries()]
		.sort(([left], [right]) => byCodepoint(left, right))
		.flatMap(([license, authors]) => {
			const notice = REGISTRY_LICENSE_NOTICES[license];
			if (!notice) return [];
			return [...authors]
				.sort(byCodepoint)
				.flatMap((author) => [
					`### ${notice.heading} — ${author}`,
					'',
					'```text',
					notice.render(author),
					'```',
					'',
				]);
		});
}

export function renderRegistryNotices(materials: readonly ThirdPartyMaterial[]): string {
	return [
		'## Non-package notices',
		'',
		'The following attributions cover material copied or adapted directly into aidd.',
		'',
		...materialSections(materials),
		'## Non-package license texts',
		'',
		...licenseSections(materials),
	].join('\n');
}

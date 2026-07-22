export interface AiddRunProvenanceLike {
	aiddDirty: boolean | null;
	aiddRevision: null | string;
	aiddVersion: null | string;
}

export function formatAiddRunProvenance(provenance: AiddRunProvenanceLike): string {
	const parts = [
		provenance.aiddVersion ? `aidd ${provenance.aiddVersion}` : 'aidd version not captured',
	];
	if (provenance.aiddRevision) parts.push(provenance.aiddRevision.slice(0, 8));
	parts.push(
		provenance.aiddDirty === null
			? 'working tree not captured'
			: provenance.aiddDirty
				? 'dirty'
				: 'clean'
	);
	return parts.join(' · ');
}

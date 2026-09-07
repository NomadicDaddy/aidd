export interface AiddRunProvenanceLike {
	aiddDirty: boolean | null;
	aiddRevision: null | string;
	aiddVersion: null | string;
}

export interface AiddRunDriverLike {
	driverId?: null | string;
	driverKind?: 'audit' | 'prompt' | 'recipe-step' | 'skill' | null;
	driverSha256?: null | string;
}

export function formatAiddRunDriver(driver: AiddRunDriverLike): string {
	if (driver.driverKind === null || driver.driverKind === undefined) return 'not captured';
	return [driver.driverKind, driver.driverId, driver.driverSha256]
		.filter((part): part is string => typeof part === 'string')
		.join(' · ');
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
				: 'clean',
	);
	return parts.join(' · ');
}

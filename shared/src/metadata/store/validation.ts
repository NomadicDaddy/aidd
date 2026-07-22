import {
	type Feature,
	type FeatureValidationResult,
	validateFeatureCollection,
	validateFeatureContract,
} from '../features.ts';
import { evaluateRoadmapCodingGate, type Roadmap } from '../roadmap.ts';

// Combine per-feature contract issues, collection-level issues/warnings, and the
// roadmap-assignment gate into a single validation result. `readRoadmap` is injected so
// the store stays the only filesystem touchpoint; a missing/invalid roadmap is swallowed
// because it is not part of the feature contract surface.
export async function evaluateFeatureValidation(
	features: Feature[],
	readRoadmap: () => Promise<Roadmap>
): Promise<FeatureValidationResult> {
	const issues = features.flatMap((feature) => validateFeatureContract(feature));
	const collectionResult = validateFeatureCollection(features);
	issues.push(...collectionResult.issues);
	const warnings: NonNullable<FeatureValidationResult['warnings']> = [
		...collectionResult.warnings,
	];
	try {
		const roadmap = await readRoadmap();
		const gate = evaluateRoadmapCodingGate(roadmap, features);
		for (const featureDirectory of gate.unmappedFeatureDirectories) {
			issues.push({
				id: featureDirectory,
				message:
					'Feature must be assigned to a roadmap milestone while roadmap.json is present',
			});
		}
		for (const mapping of gate.invalidMappings) {
			issues.push({
				id: mapping.featureDirectory,
				message: `Feature roadmap milestone '${mapping.milestone}' is not defined in roadmap.json`,
			});
		}
		for (const featureDirectory of gate.staleRoadmapFeatureDirectories) {
			warnings.push({
				id: featureDirectory,
				message: 'roadmap.json references a feature directory that no longer exists',
			});
		}
	} catch {
		// Missing or invalid roadmap.json is not part of the feature contract surface.
	}
	return {
		issues,
		total: features.length,
		valid: issues.length === 0,
		...(warnings.length > 0 ? { warnings } : {}),
	};
}

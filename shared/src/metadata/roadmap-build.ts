import type { Feature } from './features.ts';
import type { Roadmap } from './roadmap.ts';

// The single milestone a synthesized roadmap starts from. Matches selectAssignmentMilestone's
// from-scratch convention (an empty roadmap creates v1.0 at priority 1) so hand-authored and
// auto-created roadmaps share one naming rule.
export const DEFAULT_ROADMAP_MILESTONE = 'v1.0';

const AUTO_ROADMAP_DESCRIPTION = 'Initial milestone (auto-created from existing features)';

// Synthesizes a roadmap for a project that has none yet: every existing feature is mapped to a
// single v1.0 milestone, and each feature's dependencies are preserved verbatim (feature
// directories are their own IDs, and roadmap dependencies are keyed by directory, so a later
// `roadmap:apply` is a no-op on deps rather than wiping them). Feature *priority* is deliberately
// left untouched — projects use per-feature priority as fine-grained ordering, not a milestone
// tier, so this never rewrites feature.json. The result makes the coding milestone/dependency
// gate applicable to a previously roadmap-less project instead of silently skipped.
export function buildRoadmapFromFeatures(features: Feature[]): Roadmap {
	const featureEntries: Roadmap['features'] = {};
	for (const feature of features) {
		const directory = feature.directory ?? feature.id;
		const dependencies = (feature.dependencies ?? []).filter((dep) => dep.length > 0);
		featureEntries[directory] = {
			milestone: DEFAULT_ROADMAP_MILESTONE,
			...(dependencies.length > 0 ? { dependencies } : {}),
		};
	}
	return {
		features: featureEntries,
		milestones: {
			[DEFAULT_ROADMAP_MILESTONE]: {
				description: AUTO_ROADMAP_DESCRIPTION,
				priority: 1,
			},
		},
	};
}

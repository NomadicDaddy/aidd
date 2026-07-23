import type { Feature } from './features.ts';
import type { Roadmap } from './roadmap.ts';

// The single milestone a synthesized roadmap starts from. Matches selectAssignmentMilestone's
// from-scratch convention (an empty roadmap creates v1.0 at priority 1) so hand-authored and
// auto-created roadmaps share one naming rule.
export const DEFAULT_ROADMAP_MILESTONE = 'v1.0';

const AUTO_ROADMAP_DESCRIPTION = 'Initial milestone (auto-created from existing features)';

// Synthesizes a roadmap for a project that has none yet: every existing feature is mapped to a
// single v1.0 milestone, and each feature's dependencies are carried over. Roadmap dependencies
// are keyed by *directory*, but a feature's on-disk `dependencies` reference other features by
// *id* — which equals the directory only for projects where id===dir. For spernakit-derived
// projects the id is a `spernakit-<timestamp>-*` string distinct from its short directory, so we
// translate every dependency id → directory here; otherwise a later `roadmap:apply` would fail to
// resolve them and silently drop the deps from feature.json. Unresolvable deps are preserved
// verbatim (same as a genuinely dangling ref would be). Feature *priority* is deliberately left
// untouched — projects use per-feature priority as fine-grained ordering, not a milestone tier, so
// this never rewrites feature.json. The result makes the coding milestone/dependency gate
// applicable to a previously roadmap-less project instead of silently skipped.
export function buildRoadmapFromFeatures(features: Feature[]): Roadmap {
	const directoryByRef = new Map<string, string>();
	for (const feature of features) {
		const directory = feature.directory ?? feature.id;
		directoryByRef.set(feature.id, directory);
		directoryByRef.set(directory, directory);
	}
	const featureEntries: Roadmap['features'] = {};
	for (const feature of features) {
		const directory = feature.directory ?? feature.id;
		const dependencies = (feature.dependencies ?? [])
			.filter((dep) => dep.length > 0)
			.map((dep) => directoryByRef.get(dep) ?? dep);
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

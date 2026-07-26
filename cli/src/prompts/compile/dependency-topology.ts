import type { PromptPlan } from 'aidd-shared/plan/types';

import {
	type FeatureDependencyTopology,
	featureDependencyTopologySchema,
} from 'aidd-shared/metadata/features';

type Hub = FeatureDependencyTopology['hubs'][number];

// Feature titles and file paths are free text; a JSON string is always a valid YAML double-quoted
// scalar, so stringify instead of hand-escaping. Same rule as the per-feature graph renderer.
function scalar(value: string): string {
	return JSON.stringify(value);
}

function renderHub(hub: Hub): string {
	const lines = [`  - id: ${scalar(hub.id)}`];
	lines.push(`    dependents: ${hub.dependentCount}`);
	if (hub.title) lines.push(`    title: ${scalar(hub.title)}`);
	lines.push(`    passes: ${hub.passes}`);
	lines.push(`    required_by: [${hub.dependents.map((id) => scalar(id)).join(', ')}]`);
	if (hub.affectedFiles.length > 0) {
		const omitted = hub.omittedFileCount > 0 ? ` # +${hub.omittedFileCount} more` : '';
		lines.push(`    files:${omitted}`);
		for (const file of hub.affectedFiles) lines.push(`      - ${scalar(file)}`);
	}
	return lines.join('\n');
}

function renderYaml(topology: FeatureDependencyTopology): string {
	const lines = [
		`feature_count: ${topology.featureCount}`,
		`dependency_edges: ${topology.edgeCount}`,
	];
	if (topology.hubs.length === 0) {
		lines.push('hubs: [] # no feature in this project has a dependent');
	} else {
		const omitted =
			topology.omittedHubCount > 0
				? ` # top ${topology.hubs.length} by fan-in; ${topology.omittedHubCount} lower-fan-in feature(s) omitted`
				: ' # every feature with at least one dependent';
		lines.push(`hubs:${omitted}`);
		lines.push(topology.hubs.map(renderHub).join('\n'));
	}
	if (topology.dangling.length > 0) {
		lines.push('dangling_dependencies:');
		for (const entry of topology.dangling) {
			lines.push(`  - feature: ${scalar(entry.id)}`);
			lines.push(`    missing_ref: ${scalar(entry.ref)}`);
		}
	}
	if (topology.cycles.length > 0) {
		lines.push('dependency_cycles:');
		for (const cycle of topology.cycles) {
			lines.push(`  - path: ${scalar(cycle.path.join(' -> '))}`);
			const note = cycle.deadlocked
				? 'no member passes; nothing on this loop can ever be selected'
				: 'a member already passes, so the loop can still drain';
			lines.push(`    deadlocked: ${cycle.deadlocked} # ${note}`);
		}
	}
	return lines.join('\n');
}

// Integrity defects are stated as an instruction, not just data, because the auditor is the one
// actor already chartered to write findings — and both defects silently stall selection rather than
// failing anything, so nobody notices them without being told to look.
function renderIntegrityGuidance(topology: FeatureDependencyTopology): string | undefined {
	const parts: string[] = [];
	if (topology.dangling.length > 0) {
		parts.push(
			`\`dangling_dependencies\` lists dependency refs matching no feature on disk. The declaring feature can never be selected, because the ref can never resolve to a passing feature. Raise this as a finding against the backlog metadata.`,
		);
	}
	if (topology.cycles.some((cycle) => cycle.deadlocked)) {
		parts.push(
			`\`dependency_cycles\` entries with \`deadlocked: true\` are closed loops in which no member passes: every feature on the loop is permanently unselectable, each waiting on a predecessor that transitively waits on it. Raise this as a finding and name the loop.`,
		);
	}
	if (topology.cycles.some((cycle) => !cycle.deadlocked)) {
		parts.push(
			`\`dependency_cycles\` entries with \`deadlocked: false\` are closed loops that a passing member already lets work drain through, so nothing is stuck today. The declared edges are still contradictory metadata and worth a low-severity finding — do not report them as blocking work.`,
		);
	}
	return parts.length === 0 ? undefined : parts.join('\n\n');
}

/**
 * Renders whole-project dependency topology as a YAML block for audit prompts.
 *
 * An audit assigns severity, and fan-in is the blast-radius evidence severity needs: the same defect
 * in a file owned by a six-dependent feature is worse than in a leaf. aidd already holds the graph in
 * memory when the prompt is built, so handing it over costs nothing and removes the auditor's
 * incentive to shell over `feature.json` to guess at it. Returns an empty string when no topology was
 * attached, so non-audit modes and snapshot compilation are unaffected.
 */
export function compileDependencyTopology(plan: PromptPlan): string {
	const parsed = featureDependencyTopologySchema.safeParse(plan.variables.featureTopology);
	if (!parsed.success) return '';
	const topology = parsed.data;
	if (topology.featureCount === 0) return '';
	const integrity = renderIntegrityGuidance(topology);
	return `## FEATURE DEPENDENCY TOPOLOGY

aidd resolved this from \`/.aidd/features/*/feature.json\` before this iteration started, and it is
authoritative — do not shell out over the feature files to recount dependencies. Every \`id\` and
every name on a cycle \`path\` is exactly a feature directory under \`/.aidd/features/\`; only
\`missing_ref\` names something that does not exist. \`hubs\` lists only features that at least one
other feature depends on, highest fan-in first; \`files\` is that feature's recorded \`affectedFiles\`.

\`\`\`yaml
${renderYaml(topology)}
\`\`\`

Use fan-in as blast-radius evidence when you assign severity: a defect in a file listed under a
high-\`dependents\` hub propagates to every feature in that hub's \`required_by\` list, so it warrants a
higher severity than the same defect in a file no other feature depends on. State the fan-in in the
finding's evidence when it is what raised the severity. Fan-in alone never justifies a severity —
you still need a concrete defect.${integrity ? `\n\n${integrity}` : ''}
`;
}

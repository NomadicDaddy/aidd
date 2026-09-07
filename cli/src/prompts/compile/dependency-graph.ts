import type { PromptPlan } from 'aidd-shared/plan/types';

import {
	type FeatureGraphNode,
	type FeatureNeighborhood,
	featureNeighborhoodSchema,
} from 'aidd-shared/metadata/features';

// Titles are free text from feature.json and can carry colons, quotes, or a leading `-` — any of
// which breaks a bare YAML scalar. A JSON string is always a valid YAML double-quoted scalar, so
// stringify rather than hand-escaping.
function scalar(value: string): string {
	return JSON.stringify(value);
}

function renderNode(node: FeatureGraphNode, indent: string): string {
	const lines = [`${indent}- id: ${scalar(node.id)}`];
	const detail = `${indent}  `;
	if (!node.resolved) {
		lines.push(`${detail}unresolved: true # no feature.json matches this dependency ref`);
		return lines.join('\n');
	}
	lines.push(`${detail}passes: ${node.passes}`);
	if (node.status) lines.push(`${detail}status: ${scalar(node.status)}`);
	if (node.title) lines.push(`${detail}title: ${scalar(node.title)}`);
	// Only surfaced when it adds information: a ref that differs from the node it resolved to is
	// the id-vs-directory mismatch, and seeing both is what lets the agent match the graph to disk.
	if (node.ref !== node.id) lines.push(`${detail}declared_as: ${scalar(node.ref)}`);
	return lines.join('\n');
}

function renderEdgeList(key: string, nodes: FeatureGraphNode[], comment: string): string {
	if (nodes.length === 0) return `${key}: [] # ${comment}`;
	return `${key}: # ${comment}\n${nodes.map((node) => renderNode(node, '  ')).join('\n')}`;
}

function renderYaml(graph: FeatureNeighborhood): string {
	const lines = [`selected: ${scalar(graph.id)}`];
	if (graph.title) lines.push(`title: ${scalar(graph.title)}`);
	if (graph.status) lines.push(`status: ${scalar(graph.status)}`);
	if (graph.auditSource) lines.push(`audit_source: ${scalar(graph.auditSource)}`);
	lines.push(
		renderEdgeList('requires', graph.requires, 'must be passing before this feature is worked'),
	);
	lines.push(
		renderEdgeList(
			'required_by',
			graph.requiredBy,
			'features that declare a dependency ON the selected feature',
		),
	);
	if (graph.blockedBy.length > 0) {
		lines.push(`blocked_by: [${graph.blockedBy.map((id) => scalar(id)).join(', ')}]`);
	}
	return lines.join('\n');
}

// The collateral-impact instruction, stated only when there is collateral to impact. A blanket
// "check your dependents" paragraph against an empty `required_by` teaches the agent to ignore the
// section; naming the actual downstream features is what makes it actionable.
function renderImpactGuidance(graph: FeatureNeighborhood): string {
	if (graph.requiredBy.length === 0) {
		return `Nothing in the backlog declares a dependency on this feature, so no other feature's contract is waiting on the interface you build here.`;
	}
	const names = graph.requiredBy.map((node) => `\`${node.id}\``).join(', ');
	const count = graph.requiredBy.length;
	const subject = count === 1 ? 'feature' : 'features';
	return `${count} ${subject} depend on this one: ${names}. Whatever public surface you build or change here is what they will build against, so do not narrow, rename, or remove an existing exported interface they may already reference without reading them first. You are still implementing only the selected feature — do NOT implement, modify, or complete those dependents.`;
}

function renderDefectGuidance(graph: FeatureNeighborhood): string | undefined {
	const unresolved = [...graph.requires, ...graph.requiredBy].filter((node) => !node.resolved);
	const parts: string[] = [];
	if (graph.blockedBy.length > 0) {
		// The runtime dependency gate runs before this prompt is built, so a blocked selected
		// feature is a contradiction — stale metadata or an out-of-band edit, not normal work.
		parts.push(
			`\`blocked_by\` is non-empty, which should be impossible: aidd's dependency gate does not select a feature whose dependencies are unsatisfied. Treat this as a metadata defect. Report it and do not proceed on the assumption the prerequisite work exists.`,
		);
	}
	if (unresolved.length > 0) {
		parts.push(
			`A dependency ref marked \`unresolved\` matches no feature on disk — a dangling edge. Report it; do not invent the missing feature.`,
		);
	}
	return parts.length === 0 ? undefined : parts.join('\n\n');
}

/**
 * Renders the selected feature's dependency neighborhood as a YAML block.
 *
 * aidd resolves this graph in-process during selection, so the previous arrangement — prompting the
 * agent to `jq` over every `feature.json` to re-derive it — paid tokens to recompute a known answer
 * and made a correct result depend on the agent's shell and arithmetic. Returns an empty string when
 * no graph was attached (queue-less modes, phase prompts, snapshot compilation), so the section is
 * present only when it carries real data.
 */
export function compileDependencyGraph(plan: PromptPlan): string {
	const parsed = featureNeighborhoodSchema.safeParse(plan.variables.featureGraph);
	if (!parsed.success) return '';
	const graph = parsed.data;
	const defects = renderDefectGuidance(graph);
	return `## SELECTED FEATURE DEPENDENCY GRAPH

aidd resolved this from \`/.aidd/features/*/feature.json\` before this iteration started, and it is
authoritative. Use it to understand collateral impact instead of re-deriving it — do not shell out
over the feature files to recount dependencies, and do not recompute what is already stated here.
Every \`id\` below is exactly the feature directory under \`/.aidd/features/\`, except a node marked
\`unresolved: true\` — there the \`id\` is the dependency ref as declared, and no such directory exists.
Edges are direct only:
a dependency marked \`passes: true\` has already satisfied its own dependencies transitively.

\`\`\`yaml
${renderYaml(graph)}
\`\`\`

${renderImpactGuidance(graph)}${defects ? `\n\n${defects}` : ''}
`;
}

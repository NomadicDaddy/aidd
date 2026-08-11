import type { ReactNode } from 'react';

import type { SkillDefinition } from '../../api/types/skills.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { microLabelClass } from '../../lib/typography.ts';

/**
 * A captioned sub-block inside the detail card.
 *
 * Usage examples, support paths, advisory declarations and import provenance all rendered as
 * identically styled unlabeled grey mono boxes, so the same box meant a different thing skill to
 * skill — one support path on one skill, three usage command lines on the next. The caption is
 * what tells them apart; `sunken` is how a panel inside a panel differentiates elsewhere.
 */
function DetailBlock({ children, title }: { children: ReactNode; title: string }) {
	return (
		<div className="space-y-1">
			<div className={`text-muted-foreground ${microLabelClass}`}>{title}</div>
			<Card className="p-3 text-xs text-foreground" variant="sunken">
				{children}
			</Card>
		</div>
	);
}

export function SkillDetailsCard({
	onDelete,
	skill,
}: {
	onDelete: () => void;
	skill: SkillDefinition;
}) {
	const supportCount = skill.supportPaths.length;
	return (
		// `gap`, not `space-y-3` — the `mb-0` below defeats a space-y margin, which collapsed the
		// step between the description and the SUPPORT FILES micro-label to 0px and made that
		// label read as a fourth line of the description paragraph.
		<Card className="flex flex-col gap-3">
			{/* The mono skill id is CardHeader's `identifier` slot. This header was hand-rolled
			    only because that slot did not exist, which is what put the detail card a step out
			    of line with every other card title on the surface.

			    Two badges became at most one. `bundled` is true of all but a handful of skills and
			    told the reader nothing, so only `imported` still prints — a badge earns its place by
			    marking the exception. The `n files` count is gone outright: the SUPPORT FILES block
			    below lists those files by name, so the badge restated a fact three inches above its
			    own answer. */}
			<CardHeader
				action={
					skill.origin === 'imported' ? <Badge tone="neutral">imported</Badge> : undefined
				}
				className="mb-0"
				description={skill.description}
				identifier={skill.id}
				title={skill.title}
			/>
			{skill.compatibility || skill.allowedTools ? (
				<DetailBlock title="Advisory declarations">
					{skill.compatibility ? <div>Compatibility: {skill.compatibility}</div> : null}
					{skill.allowedTools ? <div>Allowed tools: {skill.allowedTools}</div> : null}
					<div className="mt-1 text-muted-foreground">
						Backend enforcement depends on the selected provider.
					</div>
				</DetailBlock>
			) : null}
			{skill.imported ? (
				<DetailBlock title="Import source">
					<div className="space-y-1">
						<div>Source: {skill.imported.sourcePath}</div>
						<div>Imported: {new Date(skill.imported.importedAt).toLocaleString()}</div>
						<div className="font-mono break-all">
							SHA-256: {skill.imported.sourceSha256}
						</div>
						<Button onClick={onDelete} size="compact" variant="danger">
							Delete imported skill
						</Button>
					</div>
				</DetailBlock>
			) : null}
			{skill.usage ? (
				<DetailBlock title="Usage">
					<pre className="overflow-auto font-mono">{skill.usage}</pre>
				</DetailBlock>
			) : null}
			{supportCount > 0 ? (
				<DetailBlock title="Support files">
					<ul className="max-h-32 overflow-auto font-mono break-all">
						{skill.supportPaths.map((path) => (
							<li key={path}>{path}</li>
						))}
					</ul>
				</DetailBlock>
			) : null}
		</Card>
	);
}

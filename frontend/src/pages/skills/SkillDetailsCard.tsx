import type { ReactNode } from 'react';

import type { SkillDefinition } from '../../api/types/skills.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
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
		<Card className="space-y-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="font-mono text-sm text-accent">{skill.id}</div>
					{/* One step for every card title on this page: the detail card, the import
					    dialog and the Definition block sit at the same level of the hierarchy, and
					    `text-2xl` display is reserved for the PageHeader. */}
					<h2 className="text-base font-semibold break-words text-foreground">
						{skill.title}
					</h2>
					<p className="mt-1 text-sm break-words text-foreground">{skill.description}</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Badge tone={skill.origin === 'imported' ? 'amber' : 'neutral'}>
						{skill.origin}
					</Badge>
					{supportCount > 0 ? (
						<Badge tone="teal">
							{supportCount} {supportCount === 1 ? 'file' : 'files'}
						</Badge>
					) : null}
				</div>
			</div>
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

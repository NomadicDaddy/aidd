import type { SkillDefinition } from '../../api/types/skills.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';

export function SkillDetailsCard({
	onDelete,
	skill,
}: {
	onDelete: () => void;
	skill: SkillDefinition;
}) {
	return (
		<Card className="space-y-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="font-mono text-sm text-teal-700 dark:text-teal-300">
						{skill.id}
					</div>
					<h2 className="text-foreground text-xl font-semibold break-words">
						{skill.title}
					</h2>
					<p className="mt-1 text-sm break-words text-neutral-600 dark:text-neutral-400">
						{skill.description}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Badge tone={skill.origin === 'imported' ? 'amber' : 'neutral'}>
						{skill.origin}
					</Badge>
					{skill.supportPaths.length > 0 ? (
						<Badge tone="cyan">{skill.supportPaths.length} files</Badge>
					) : null}
				</div>
			</div>
			{skill.compatibility || skill.allowedTools ? (
				<div className="rounded-md bg-neutral-100 p-3 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
					<div className="font-medium">Advisory declarations</div>
					{skill.compatibility ? <div>Compatibility: {skill.compatibility}</div> : null}
					{skill.allowedTools ? <div>Allowed tools: {skill.allowedTools}</div> : null}
					<div className="mt-1 text-neutral-500">
						Backend enforcement depends on the selected provider.
					</div>
				</div>
			) : null}
			{skill.imported ? (
				<div className="space-y-1 rounded-md bg-neutral-100 p-3 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
					<div>Source: {skill.imported.sourcePath}</div>
					<div>Imported: {new Date(skill.imported.importedAt).toLocaleString()}</div>
					<div className="font-mono break-all">
						SHA-256: {skill.imported.sourceSha256}
					</div>
					<Button onClick={onDelete} size="compact" variant="danger">
						Delete imported skill
					</Button>
				</div>
			) : null}
			{skill.usage ? (
				<pre className="overflow-auto rounded-md bg-neutral-100 p-3 font-mono text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
					{skill.usage}
				</pre>
			) : null}
			{skill.supportPaths.length > 0 ? (
				<ul className="max-h-32 overflow-auto rounded-md bg-neutral-100 p-3 font-mono text-xs break-all text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
					{skill.supportPaths.map((path) => (
						<li key={path}>{path}</li>
					))}
				</ul>
			) : null}
		</Card>
	);
}

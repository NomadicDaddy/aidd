import type { ProjectStack } from 'aidd-shared/metadata/project-stack';
import type { ReactNode } from 'react';

import { Badge } from '../../components/ui/badge.tsx';
import { Tooltip } from '../../components/ui/tooltip.tsx';

const sourceLabels: Record<ProjectStack['source'], string> = {
	detected: 'Detected from repository evidence',
	'fleet-manifest': 'Declared by the Spernakit fleet manifest',
	'package-declaration': 'Declared by package.json',
	'project-declaration': 'Declared by project instructions',
	unknown: 'No reliable stack evidence found',
};

function technologyLabels(stack: ProjectStack): string[] {
	const primaryParts = stack.label
		.toLowerCase()
		.split(/[+/]/)
		.map((part) => part.trim());
	return [...new Set([...stack.languages, ...stack.runtimes, ...stack.frameworks])].filter(
		(label) => !primaryParts.includes(label.toLowerCase()),
	);
}

function valueLine(label: string, values: string[]): ReactNode {
	if (values.length === 0) return null;
	return (
		<p>
			<span className="font-medium text-background">{label}:</span> {values.join(', ')}
		</p>
	);
}

function tooltipContent(stack: ProjectStack) {
	return (
		<div className="space-y-1">
			<p className="font-semibold text-white">{stack.label}</p>
			{valueLine('Languages', stack.languages)}
			{valueLine('Runtimes', stack.runtimes)}
			{valueLine('Frameworks', stack.frameworks)}
			<p className="text-muted-foreground">{sourceLabels[stack.source]}</p>
		</div>
	);
}

function primaryBadge(stack: ProjectStack) {
	return (
		<Tooltip className="max-w-sm" content={tooltipContent(stack)}>
			<span className="inline-flex">
				<Badge tone={stack.family === 'unknown' ? 'neutral' : 'teal'}>{stack.label}</Badge>
			</span>
		</Tooltip>
	);
}

export function ProjectStackDisplay({
	stack,
	variant,
}: {
	stack: ProjectStack;
	variant: 'badges' | 'detail' | 'table';
}) {
	const technologies = technologyLabels(stack);
	if (variant === 'detail') {
		return (
			<div className="space-y-1">
				<div>{primaryBadge(stack)}</div>
				{technologies.length > 0 ? (
					<p className="text-xs text-muted-foreground">{technologies.join(' · ')}</p>
				) : null}
				<p className="text-xs text-muted-foreground">{sourceLabels[stack.source]}</p>
			</div>
		);
	}
	if (variant === 'badges') {
		return (
			<>
				{primaryBadge(stack)}
				{technologies.slice(0, 2).map((technology) => (
					<Badge key={technology} tone="neutral">
						{technology}
					</Badge>
				))}
				{technologies.length > 2 ? (
					<Badge tone="neutral">+{technologies.length - 2}</Badge>
				) : null}
			</>
		);
	}
	return (
		<div className="min-w-0 space-y-1">
			<div>{primaryBadge(stack)}</div>
			{technologies.length > 0 ? (
				<p className="max-w-48 truncate text-[10px] text-muted-foreground">
					{technologies.slice(0, 3).join(' · ')}
					{technologies.length > 3 ? ` +${technologies.length - 3}` : ''}
				</p>
			) : null}
		</div>
	);
}

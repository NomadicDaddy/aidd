import type { CSSProperties, ReactNode } from 'react';

import { default as Settings } from 'lucide-react/dist/esm/icons/settings';

import { cn } from '../../lib/cn.ts';
import {
	cleanIdentityValue,
	type ExecutionIdentity,
	type ExecutionIdentityItem,
	executionIdentityItems,
	type ExecutionIdentityKind,
	identityBadgeStyle,
	reasoningBadgeClass,
} from '../../lib/executionIdentity.ts';
import { Tooltip } from '../ui/tooltip.tsx';

export type { ExecutionIdentity } from '../../lib/executionIdentity.ts';

function itemClass(item: ExecutionIdentityItem): string {
	return item.kind === 'reasoning' ? reasoningBadgeClass(item.label) : '';
}

function itemStyle(item: ExecutionIdentityItem): CSSProperties | undefined {
	return item.kind === 'reasoning' ? undefined : identityBadgeStyle(item.kind, item.label);
}

function itemFieldLabel(kind: ExecutionIdentityKind): string {
	if (kind === 'backend') return 'CLI';
	if (kind === 'model') return 'Model';
	return 'Reasoning';
}

export function ExecutionIdentityDetails({
	backend,
	hint,
	model,
	provider,
	reasoningEffort,
}: { hint?: ReactNode } & ExecutionIdentity) {
	const items = executionIdentityItems({ backend, model, provider, reasoningEffort });
	const cleanProvider = cleanIdentityValue(provider);
	return (
		<div className="space-y-2 text-left">
			<dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
				{items.map((item) => (
					<div className="contents" key={item.kind}>
						<dt className="font-medium">{itemFieldLabel(item.kind)}</dt>
						<dd className="min-w-0 break-all">{item.label}</dd>
					</div>
				))}
				{cleanProvider ? (
					<div className="contents">
						<dt className="font-medium">Provider</dt>
						<dd className="min-w-0 break-all">{cleanProvider}</dd>
					</div>
				) : null}
			</dl>
			{hint ? <div className="text-neutral-500 dark:text-neutral-400">{hint}</div> : null}
		</div>
	);
}

export function ExecutionIdentityBadges({
	backend,
	className,
	hint,
	model,
	provider,
	reasoningEffort,
	withTooltip = true,
}: {
	className?: string;
	hint?: ReactNode;
	withTooltip?: boolean;
} & ExecutionIdentity) {
	const items = executionIdentityItems({ backend, model, provider, reasoningEffort });
	if (items.length === 0) return null;
	const cleanProvider = cleanIdentityValue(provider);
	const ariaLabel = items
		.map((item) => `${itemFieldLabel(item.kind)} ${item.label}`)
		.concat(cleanProvider ? [`Provider ${cleanProvider}`] : [])
		.concat(typeof hint === 'string' && hint.trim() ? [hint.trim()] : [])
		.join(', ');
	const badges = (
		<span
			aria-label={ariaLabel}
			className={cn(
				'inline-flex max-w-full min-w-0 items-stretch overflow-hidden rounded-[3px] text-[11px] leading-5 font-semibold shadow-sm ring-1 ring-black/10 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none dark:ring-white/15 dark:focus-visible:ring-teal-300',
				className,
			)}
			role="group">
			{items.map((item, index) => (
				<span
					className={cn(
						'inline-flex min-w-0 items-center gap-1 px-1.5 py-px',
						index > 0 ? 'border-l border-white/30' : '',
						itemClass(item),
					)}
					key={item.kind}
					style={itemStyle(item)}>
					{item.kind === 'backend' ? (
						<Settings
							aria-hidden="true"
							className="size-3 shrink-0"
							strokeWidth={2.25}
						/>
					) : null}
					<span
						className={item.kind === 'model' ? 'max-w-48 truncate' : undefined}
						title={item.label}>
						{item.label}
					</span>
				</span>
			))}
		</span>
	);
	return withTooltip ? (
		<Tooltip
			content={
				<ExecutionIdentityDetails
					backend={backend}
					hint={hint}
					model={model}
					provider={provider}
					reasoningEffort={reasoningEffort}
				/>
			}>
			{badges}
		</Tooltip>
	) : (
		badges
	);
}

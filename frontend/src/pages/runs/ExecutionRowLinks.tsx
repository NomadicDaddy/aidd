import type { ReactNode } from 'react';

import { Link } from 'react-router';

import { cn } from '../../lib/cn.ts';

const interactiveTextClass =
	'rounded font-medium text-teal-700 underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none dark:text-teal-300';

export function ConsoleSelectionButton({
	children,
	className,
	label,
	onSelect,
	selected,
}: {
	children: ReactNode;
	className?: string;
	label: string;
	onSelect: () => void;
	selected: boolean;
}) {
	return (
		<button
			aria-label={label}
			aria-pressed={selected}
			className={cn(
				interactiveTextClass,
				'text-left focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-neutral-950',
				className,
			)}
			onClick={onSelect}
			title="Show in Live Console"
			type="button">
			{children}
		</button>
	);
}

export function ProjectDetailLink({
	className,
	href,
	label,
	name,
}: {
	className?: string;
	href: string;
	label: string;
	name: string;
}) {
	return (
		<Link
			aria-label={label}
			className={cn(
				interactiveTextClass,
				'-my-1.5 inline-block py-1.5 focus-visible:outline-none',
				className,
			)}
			to={href}>
			{name}
		</Link>
	);
}

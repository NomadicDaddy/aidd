import type { ReactNode } from 'react';

import { Link } from 'react-router';

import { cn } from '../../lib/cn.ts';

// The accent token, not a raw teal. The literal computed lighter and mintier than the accent the
// active nav item and the Workflow row icon already use, so the two most-repeated interactive
// colours on the page were a near-miss of each other rather than one colour.
const interactiveTextClass =
	'rounded font-medium text-accent underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none';

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
				'text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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

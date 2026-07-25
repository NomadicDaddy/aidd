import type { ReactNode } from 'react';

import type { ShortcutKey } from '../../lib/keyboardShortcuts.ts';

import { cn } from '../../lib/cn.ts';

export function Keycap({
	children,
	className,
}: {
	children: ReactNode;
	className?: string | undefined;
}) {
	return (
		<kbd
			className={cn(
				'inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5',
				'border-neutral-200 bg-white font-mono text-[0.68rem] text-neutral-600 shadow-sm shadow-neutral-950/5',
				'dark:border-teal-900/60 dark:bg-slate-950 dark:text-teal-100 dark:shadow-teal-950/20',
				className,
			)}>
			{children}
		</kbd>
	);
}

export function ShortcutChord({
	className,
	keyClassName,
	keys,
}: {
	className?: string | undefined;
	keyClassName?: string | undefined;
	keys: ShortcutKey[];
}) {
	return (
		<span className={cn('inline-flex shrink-0 items-center gap-1', className)}>
			{keys.map((key, index) => (
				<Keycap className={keyClassName} key={`${key}-${index}`}>
					{key}
				</Keycap>
			))}
		</span>
	);
}

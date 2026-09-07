import type { ReactNode } from 'react';

import { Fragment } from 'react';

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
				'border-border bg-card font-mono text-2xs text-foreground shadow-sm shadow-foreground/5',
				className,
			)}>
			{children}
		</kbd>
	);
}

/**
 * Renders a shortcut as keycaps with an explicit separator, because two caps side by side cannot
 * say whether they are pressed together (`Ctrl`+`K`) or in sequence (`g` then `d`) — and the
 * overlay lists both kinds in the same column.
 */
export function ShortcutChord({
	className,
	keyClassName,
	keys,
	sequential = false,
}: {
	className?: string | undefined;
	keyClassName?: string | undefined;
	keys: ShortcutKey[];
	/** True when the keys are pressed one after another rather than held together. */
	sequential?: boolean;
}) {
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-center',
				sequential ? 'gap-1.5' : 'gap-1',
				className,
			)}>
			{keys.map((key, index) => (
				<Fragment key={`${key}-${index}`}>
					{index > 0 && (
						// Hidden from assistive technology: `aria-keyshortcuts` on the control that
						// owns the shortcut is what announces it, and a read-aloud "then" between
						// caps only adds noise.
						<span
							aria-hidden="true"
							className={cn(
								'text-muted-foreground',
								sequential ? 'text-2xs' : 'text-xs',
							)}>
							{sequential ? 'then' : '+'}
						</span>
					)}
					<Keycap className={keyClassName}>{key}</Keycap>
				</Fragment>
			))}
		</span>
	);
}

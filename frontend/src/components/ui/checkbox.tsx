import type { ComponentPropsWithRef } from 'react';

import { cn } from '../../lib/cn.ts';

type CheckboxProps = Omit<ComponentPropsWithRef<'input'>, 'type'>;

export function Checkbox({ className, ...props }: CheckboxProps) {
	return (
		<input
			className={cn(
				'h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			type="checkbox"
			{...props}
		/>
	);
}

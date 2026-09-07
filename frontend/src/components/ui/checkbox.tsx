import type { ComponentPropsWithRef } from 'react';

import { useEffect, useImperativeHandle, useRef } from 'react';

import { cn } from '../../lib/cn.ts';

type CheckboxProps = {
	/** Paint and announce a partial aggregate selection without inventing a custom checkbox. */
	indeterminate?: boolean;
} & Omit<ComponentPropsWithRef<'input'>, 'type'>;

export function Checkbox({ className, indeterminate = false, ref, ...props }: CheckboxProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
	useEffect(() => {
		if (inputRef.current) inputRef.current.indeterminate = indeterminate;
	}, [indeterminate]);

	return (
		<input
			className={cn(
				'h-4 w-4 shrink-0 cursor-pointer rounded accent-accent outline outline-1 -outline-offset-1 outline-control-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			ref={inputRef}
			type="checkbox"
			{...props}
		/>
	);
}

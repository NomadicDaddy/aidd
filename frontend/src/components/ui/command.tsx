import type { ComponentProps } from 'react';

import { Command as CommandPrimitive, useCommandState } from 'cmdk';
import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { useLayoutEffect, useRef } from 'react';

import { cn } from '../../lib/cn.ts';
import { formControlClass } from '../../lib/formStyles.ts';
import { commandGroupSectionCaptionClass } from '../../lib/typography.ts';

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
	return (
		<CommandPrimitive
			className={cn(
				'flex h-full w-full flex-col overflow-hidden rounded-lg bg-card text-card-foreground',
				className,
			)}
			{...props}
		/>
	);
}

export function CommandInput({
	className,
	wrapperClassName,
	...props
}: { wrapperClassName?: string } & ComponentProps<typeof CommandPrimitive.Input>) {
	const activeValue = useCommandState((state) => state.value);
	const wrapperRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const input = wrapperRef.current?.querySelector('[cmdk-input]');
		input?.setAttribute(
			'aria-activedescendant',
			input.closest('[cmdk-root]')?.querySelector('[aria-selected="true"]')?.id ?? '',
		);
	}, [activeValue]);

	return (
		<div className={cn('relative', wrapperClassName)} cmdk-input-wrapper="" ref={wrapperRef}>
			<Search
				aria-hidden="true"
				className="pointer-events-none absolute top-3.5 left-3 h-4 w-4 text-muted-foreground"
			/>
			<CommandPrimitive.Input
				className={cn(
					formControlClass,
					'h-11 pl-9 disabled:cursor-not-allowed disabled:opacity-50',
					className,
				)}
				{...props}
			/>
		</div>
	);
}

export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
	return (
		<CommandPrimitive.List
			className={cn('max-h-80 overflow-x-hidden overflow-y-auto p-1', className)}
			{...props}
		/>
	);
}

export function CommandEmpty(props: ComponentProps<typeof CommandPrimitive.Empty>) {
	return (
		<CommandPrimitive.Empty
			className="py-6 text-center text-sm text-muted-foreground"
			{...props}
		/>
	);
}

export function CommandGroup({
	className,
	...props
}: ComponentProps<typeof CommandPrimitive.Group>) {
	return (
		<CommandPrimitive.Group
			className={cn(
				'text-foreground',
				'[&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:bg-card/95 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:backdrop-blur-sm',
				commandGroupSectionCaptionClass,
				className,
			)}
			{...props}
		/>
	);
}

export function CommandSeparator({
	className,
	...props
}: ComponentProps<typeof CommandPrimitive.Separator>) {
	return (
		<CommandPrimitive.Separator
			className={cn('-mx-1 my-1 h-px bg-border', className)}
			{...props}
		/>
	);
}

export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
	return (
		<CommandPrimitive.Item
			className={cn(
				// `group` so a row's glyph can follow its selected state, the way the sidebar's
				// active NavLink colors its own icon.
				'group relative flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none select-none',
				'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
				'data-[selected=true]:bg-accent-muted data-[selected=true]:text-accent-muted-foreground data-[selected=true]:shadow-[inset_4px_0_0_var(--accent)]',
				'[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
				className,
			)}
			{...props}
		/>
	);
}

export function CommandShortcut({ className, ...props }: ComponentProps<'span'>) {
	return (
		<span
			className={cn(
				'ml-auto text-2xs font-medium tracking-widest text-muted-foreground group-data-[selected=true]:text-accent-muted-foreground',
				className,
			)}
			{...props}
		/>
	);
}

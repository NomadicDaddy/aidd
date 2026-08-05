import type { ComponentProps } from 'react';

import { Command as CommandPrimitive } from 'cmdk';
import { default as Search } from 'lucide-react/dist/esm/icons/search';

import { cn } from '../../lib/cn.ts';

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
	return (
		<div
			className={cn('flex items-center gap-2 border-b border-border px-3', wrapperClassName)}
			cmdk-input-wrapper="">
			<Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
			<CommandPrimitive.Input
				className={cn(
					'flex h-11 w-full bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:!outline-offset-0 focus-visible:!outline-none disabled:cursor-not-allowed disabled:opacity-50',
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
				'overflow-hidden text-foreground',
				// The `sectionCaptionClass` utilities, one variant prefix at a time: cmdk owns the
				// heading element, so it can only be reached through a descendant variant, and
				// Tailwind only emits classes it can read literally. `command-caption.test.ts`
				// holds this list to that shared string.
				'[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase',
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
				'group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none select-none',
				'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
				'data-[selected=true]:bg-accent-muted data-[selected=true]:text-accent-muted-foreground',
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
				'ml-auto text-2xs font-medium tracking-widest text-muted-foreground',
				className,
			)}
			{...props}
		/>
	);
}

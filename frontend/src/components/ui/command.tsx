import type { ComponentProps } from 'react';

import { Command as CommandPrimitive } from 'cmdk';
import { default as Search } from 'lucide-react/dist/esm/icons/search';

import { cn } from '../../lib/cn.ts';

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
	return (
		<CommandPrimitive
			className={cn(
				'bg-card text-card-foreground flex h-full w-full flex-col overflow-hidden rounded-lg',
				className
			)}
			{...props}
		/>
	);
}

export function CommandInput({
	className,
	wrapperClassName,
	...props
}: ComponentProps<typeof CommandPrimitive.Input> & { wrapperClassName?: string }) {
	return (
		<div
			className={cn('border-border flex items-center gap-2 border-b px-3', wrapperClassName)}
			cmdk-input-wrapper="">
			<Search aria-hidden="true" className="text-muted-foreground h-4 w-4 shrink-0" />
			<CommandPrimitive.Input
				className={cn(
					'text-foreground placeholder:text-muted-foreground flex h-11 w-full bg-transparent py-3 text-sm outline-none focus-visible:!outline-offset-0 focus-visible:!outline-none disabled:cursor-not-allowed disabled:opacity-50',
					className
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
			className="text-muted-foreground py-6 text-center text-sm"
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
				'text-foreground overflow-hidden',
				'[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[0.65rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:uppercase',
				className
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
			className={cn('bg-border -mx-1 my-1 h-px', className)}
			{...props}
		/>
	);
}

export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
	return (
		<CommandPrimitive.Item
			className={cn(
				'relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none select-none',
				'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
				'data-[selected=true]:bg-accent-muted data-[selected=true]:text-accent-muted-foreground',
				'[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
				className
			)}
			{...props}
		/>
	);
}

export function CommandShortcut({ className, ...props }: ComponentProps<'span'>) {
	return (
		<span
			className={cn(
				'text-muted-foreground ml-auto text-[0.7rem] font-medium tracking-widest',
				className
			)}
			{...props}
		/>
	);
}

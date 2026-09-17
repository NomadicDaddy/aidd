import { cn } from '../../lib/cn.ts';

export function AppBrand({ collapsed }: { collapsed: boolean }) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<img
				alt=""
				className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-border/40"
				// 40px, matching h-10/w-10. Stated intrinsically as well as in classes so the
				// brand block reserves its width before the PNG arrives and the text does not jump.
				height={40}
				src="/favicon-96x96.png"
				width={40}
			/>
			<div className={cn('flex min-w-0 flex-col', collapsed && 'sm:hidden')} translate="no">
				<span className="truncate font-display text-base leading-none font-semibold tracking-[0.18em] text-foreground">
					aidd
				</span>
				<span className="mt-1 truncate font-mono text-2xs leading-none tracking-normal text-muted-foreground">
					v{__AIDD_VERSION__}
				</span>
			</div>
		</div>
	);
}

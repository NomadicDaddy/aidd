import { Card } from '../ui/card.tsx';
import { Skeleton } from '../ui/skeleton.tsx';

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
	return <Card className="py-10 text-center text-sm text-muted-foreground">{message}</Card>;
}

export function SkeletonRows({
	columns = 4,
	count = 5,
	label = 'Loading rows…',
}: {
	columns?: number;
	count?: number;
	label?: string;
}) {
	const colWidths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-1/4', 'w-1/2'];
	return (
		<Card aria-busy="true" aria-live="polite" className="overflow-hidden p-0">
			<span className="sr-only">{label}</span>
			<div className="border-b border-border bg-muted px-4 py-3">
				<Skeleton className="h-3 w-24" />
			</div>
			<ul className="divide-y divide-border">
				{Array.from({ length: count }).map((_, rowIndex) => (
					<li
						className="grid gap-3 px-4 py-3"
						key={rowIndex}
						style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
						{Array.from({ length: columns }).map((__, colIndex) => (
							<Skeleton
								className={`h-3 ${colWidths[(rowIndex + colIndex) % colWidths.length]}`}
								key={colIndex}
							/>
						))}
					</li>
				))}
			</ul>
		</Card>
	);
}

export function SkeletonCards({
	count = 6,
	label = 'Loading cards…',
}: {
	count?: number;
	label?: string;
}) {
	return (
		<div
			aria-busy="true"
			aria-live="polite"
			className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
			<span className="sr-only">{label}</span>
			{Array.from({ length: count }).map((_, index) => (
				<Card className="space-y-3" key={index}>
					<Skeleton className="h-3 w-2/3" />
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-5/6" />
					<div className="flex gap-2">
						<Skeleton className="h-5 w-16" />
						<Skeleton className="h-5 w-12" />
					</div>
				</Card>
			))}
		</div>
	);
}

export function SkeletonLines({
	count = 4,
	label = 'Loading…',
}: {
	count?: number;
	label?: string;
}) {
	const widths = ['w-full', 'w-5/6', 'w-3/4', 'w-2/3', 'w-1/2'];
	return (
		<div aria-busy="true" aria-live="polite" className="space-y-2">
			<span className="sr-only">{label}</span>
			{Array.from({ length: count }).map((_, index) => (
				<Skeleton className={`h-3 ${widths[index % widths.length]}`} key={index} />
			))}
		</div>
	);
}

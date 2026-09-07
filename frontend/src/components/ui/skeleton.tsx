import type { ComponentProps } from 'react';

import { cn } from '../../lib/cn.ts';

/**
 * Base skeleton placeholder — a single pulsing block used to compose loading
 * states. Carries `aria-hidden` so the shimmer is not announced; callers wrap
 * groups of skeletons in an `aria-busy` / `aria-live` region with an sr-only
 * label (see `LoadingState.tsx`).
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div
			aria-hidden="true"
			className={cn('animate-pulse rounded bg-muted', className)}
			{...props}
		/>
	);
}

import { cn } from '../../lib/cn.ts';
import { formatFilesystemPath } from '../../lib/formatters.ts';

/**
 * A filesystem path on screen.
 *
 * The normalisation and the `font-mono` travel together on purpose. Splitting them is how the same
 * project directory ended up rendering as `d:\applications\aidd` in Geist Sans in the project header
 * and `D:/applications/aidd` in Geist Mono on a tab two clicks away: each call site made its own
 * decision about the face, and nobody made one about the case or the separators at all.
 *
 * `title` carries the full path so a truncated one is still recoverable on hover — the class that
 * cuts it (`truncate`, `break-all`) is the caller's, since only the caller knows its column.
 *
 * A caller that renders a *shortened* path — a basename in a narrow column — passes `title` to say
 * what the hover should recover instead, because the displayed text is no longer the whole answer.
 */
export function FilePath({
	className,
	path,
	title,
}: {
	className?: string;
	path: null | string;
	title?: string;
}) {
	const display = formatFilesystemPath(path);
	return (
		<span className={cn('font-mono', className)} title={title ?? display}>
			{display}
		</span>
	);
}

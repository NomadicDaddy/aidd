import { default as ClipboardCopy } from 'lucide-react/dist/esm/icons/clipboard-copy';
import { toast } from 'sonner';

import { cn } from '../../lib/cn.ts';
import { formatFilesystemPath } from '../../lib/formatters.ts';
import { IconButton } from '../ui/button.tsx';

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
	copyable = false,
	path,
	title,
}: {
	className?: string;
	copyable?: boolean;
	path: null | string;
	title?: string;
}) {
	const display = formatFilesystemPath(path);
	const full = formatFilesystemPath(title ?? path);
	const value = (
		<span className={cn('font-mono', className)} title={full}>
			{display}
		</span>
	);
	if (!copyable || !full) return value;
	return (
		<span className="flex min-w-0 items-center gap-2">
			{value}
			<IconButton
				ariaLabel="Copy project path"
				className="shrink-0"
				onClick={() => {
					void navigator.clipboard
						.writeText(full)
						.then(() => toast.success('Project path copied'))
						.catch(() => toast.error('Clipboard write failed'));
				}}
				variant="ghost">
				<ClipboardCopy aria-hidden="true" className="h-4 w-4" />
			</IconButton>
		</span>
	);
}

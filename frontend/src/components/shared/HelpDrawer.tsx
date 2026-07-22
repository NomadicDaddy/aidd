import { default as ExternalLink } from 'lucide-react/dist/esm/icons/external-link';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';

import { docSectionBySlug } from '../../pages/docs/docs-manifest.ts';
import { IconButton } from '../ui/button.tsx';
import { Dialog } from '../ui/dialog.tsx';

const HelpDrawerBody = lazy(() =>
	import('../../pages/docs/HelpDrawerBody.tsx').then((m) => ({ default: m.HelpDrawerBody }))
);

const TITLE_ID = 'help-drawer-title';

/**
 * Right-side drawer that shows focused help for the current page, built on the
 * shared {@link Dialog} primitive (focus trap, Escape/backdrop close, focus
 * restore). The panel is fixed to the right edge so it fills the viewport
 * height regardless of the overlay's centering.
 */
export function HelpDrawer({
	onClose,
	open,
	slug,
}: {
	onClose: () => void;
	open: boolean;
	slug: string;
}) {
	const section = docSectionBySlug(slug);

	return (
		<Dialog aria-labelledby={TITLE_ID} onClose={onClose} open={open}>
			<div
				className="fixed inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-neutral-200 bg-white shadow-2xl dark:border-cyan-900/70 dark:bg-slate-950"
				onMouseDown={(event) => event.stopPropagation()}>
				<div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-slate-800">
					<div>
						<div className="text-[0.65rem] font-semibold tracking-wide text-cyan-700 uppercase dark:text-cyan-300">
							Help
						</div>
						<h2
							className="text-base font-semibold text-neutral-950 dark:text-neutral-50"
							id={TITLE_ID}>
							{section?.title ?? 'Documentation'}
						</h2>
					</div>
					<IconButton
						ariaLabel="Close help"
						className="-mt-1 -mr-1 border-0 bg-transparent text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-slate-800 dark:hover:text-neutral-100"
						onClick={onClose}
						variant="ghost">
						<X className="h-4 w-4" />
					</IconButton>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
					<Suspense
						fallback={
							<div className="text-sm text-neutral-500 dark:text-neutral-400">
								Loading…
							</div>
						}>
						<HelpDrawerBody slug={slug} />
					</Suspense>
				</div>
				<div className="border-t border-neutral-200 px-5 py-3 dark:border-slate-800">
					<Link
						className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-700 hover:text-cyan-600 dark:text-cyan-300"
						onClick={onClose}
						to={`/docs/${slug}`}>
						<ExternalLink className="h-3.5 w-3.5" />
						Open full docs
					</Link>
				</div>
			</div>
		</Dialog>
	);
}

import { default as Bug } from 'lucide-react/dist/esm/icons/bug';
import { lazy, useState } from 'react';

import { useDeferredMount } from '../../hooks/useDeferredMount.ts';
import { cn } from '../../lib/cn.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { Button } from '../ui/button.tsx';
import { DeferredSurface } from './deferredSurfaces.tsx';

const ProjectReportDialog = lazy(() =>
	import('./ProjectReportDialog.tsx').then((module) => ({
		default: module.ProjectReportDialog,
	})),
);

/**
 * Sidebar trigger for the project report dialog, and the owner of its open state.
 *
 * Only the trigger ships with the shell: the form is a `lazy()` boundary (see
 * {@link ProjectReportDialog}) that is mounted the first time it is opened, so the project list
 * query and the dialog/field primitives it needs are fetched with that first open rather than with
 * the app. Also rendered by the project detail page's Reports tab, which passes its own project.
 */
export function ProjectReportButton({
	collapsed,
	defaultProjectId,
	label = 'Report',
	showLabelOnMobile = false,
	variant = 'ghost',
}: {
	collapsed: boolean;
	defaultProjectId?: string;
	label?: string;
	showLabelOnMobile?: boolean;
	variant?: 'ghost' | 'primary' | 'secondary';
}) {
	const [open, setOpen] = useState(false);
	const mounted = useDeferredMount(open);

	return (
		<>
			<Button
				aria-label="Report a bug or request a feature"
				// See `DirectiveLaunchButton`: 40x44 before this, the rail's other half of the same
				// pair.
				className={cn(
					showLabelOnMobile ? 'px-3' : 'px-0',
					collapsed ? 'w-11 sm:w-10' : 'w-11 sm:w-full sm:justify-start sm:px-3',
					showLabelOnMobile && !collapsed && 'w-auto justify-start',
				)}
				onClick={() => setOpen(true)}
				onClickCapture={() =>
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'reports.open',
						source: 'ProjectReportButton',
					})
				}
				type="button"
				variant={variant}>
				<Bug className="h-4 w-4" />
				{!collapsed && (
					<span
						className={cn(
							'text-sm font-medium',
							!showLabelOnMobile && 'hidden sm:inline',
						)}>
						{label}
					</span>
				)}
			</Button>
			<DeferredSurface mounted={mounted}>
				<ProjectReportDialog
					defaultProjectId={defaultProjectId}
					onClose={() => setOpen(false)}
					open={open}
				/>
			</DeferredSurface>
		</>
	);
}

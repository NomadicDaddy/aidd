import { default as X } from 'lucide-react/dist/esm/icons/x';

import { IconButton } from '../ui/button.tsx';

export function ProjectReportDialogHeader({ onClose }: { onClose: () => void }) {
	return (
		<div className="flex flex-none items-start justify-between gap-3 px-5 pt-5">
			<div className="min-w-0">
				<h2 className="text-base font-semibold text-foreground" id="project-report-title">
					File a report
				</h2>
				<p
					className="mt-1 text-sm text-muted-foreground"
					id="project-report-description-text">
					Reports create backlog feature files in the selected project.
				</p>
			</div>
			<IconButton ariaLabel="Close report form" onClick={onClose} variant="ghost">
				<X className="h-4 w-4" />
			</IconButton>
		</div>
	);
}

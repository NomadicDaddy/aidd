import type { ProjectFeature } from '../../../api/types.ts';

import { ConfirmDialog } from '../../../components/shared/ConfirmDialog.tsx';
import { featureDirectory } from './featuresUtils.ts';
import { FindingDismissalDialog } from './FindingDismissalDialog.tsx';

export function FeatureDispositionDialogs({
	deletePending,
	dismissPending,
	onCancelDelete,
	onCancelDismissal,
	onConfirmDelete,
	onConfirmDismissal,
	pendingDelete,
	pendingDismissal,
}: {
	deletePending: boolean;
	dismissPending: boolean;
	onCancelDelete: () => void;
	onCancelDismissal: () => void;
	onConfirmDelete: () => void;
	onConfirmDismissal: Parameters<typeof FindingDismissalDialog>[0]['onConfirm'];
	pendingDelete: null | ProjectFeature;
	pendingDismissal: null | ProjectFeature;
}) {
	return (
		<>
			<ConfirmDialog
				confirmLabel="Delete feature"
				description={
					pendingDelete
						? `${featureDirectory(pendingDelete)} will be removed from .aidd/features. This cannot be undone.`
						: undefined
				}
				destructive
				isPending={deletePending}
				onClose={onCancelDelete}
				onConfirm={onConfirmDelete}
				open={pendingDelete !== null}
				title="Delete feature?"
			/>
			{pendingDismissal ? (
				<FindingDismissalDialog
					feature={pendingDismissal}
					isPending={dismissPending}
					onClose={onCancelDismissal}
					onConfirm={onConfirmDismissal}
				/>
			) : null}
		</>
	);
}

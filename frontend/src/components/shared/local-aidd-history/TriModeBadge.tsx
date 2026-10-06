import type { ReactNode } from 'react';

import { type AiddTriumvirateRoles } from 'aidd-shared/execution-mode';

import { Badge } from '../../ui/badge.tsx';
import { Tooltip } from '../../ui/tooltip.tsx';
import { ExecutionIdentityBadges } from '../ExecutionIdentityBadges.tsx';

function roleIdentity(role: { backend: string; model?: string }): ReactNode {
	return (
		<ExecutionIdentityBadges backend={role.backend} model={role.model} withTooltip={false} />
	);
}

function triumvirateRolesTooltip(roles: AiddTriumvirateRoles | null): ReactNode {
	if (!roles) return 'Tri-mode run; role metadata was not recorded.';
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-left">
			<dt className="font-medium">Primary</dt>
			<dd>{roleIdentity(roles.primary)}</dd>
			<dt className="font-medium">Secondary</dt>
			<dd>{roleIdentity(roles.secondary)}</dd>
			<dt className="font-medium">Overseer</dt>
			<dd>{roleIdentity(roles.overseer)}</dd>
			<dt className="font-medium">Execution</dt>
			<dd>{roleIdentity(roles.execution)}</dd>
		</dl>
	);
}

export function TriModeBadge({ roles }: { roles: AiddTriumvirateRoles | null }) {
	return (
		<Tooltip content={triumvirateRolesTooltip(roles)} maxWidth="sm">
			<span className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
				<Badge tone="teal">Tri-mode</Badge>
			</span>
		</Tooltip>
	);
}

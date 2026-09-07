import type { ReactNode } from 'react';

import { Link } from 'react-router';

import type { TelemetryResourceType } from '../../api/types.ts';

import { cn } from '../../lib/cn.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { machineLabelClass } from '../../lib/typography.ts';
import { type TelemetryResourceAvailability, telemetryResourceLink } from './resourceLink.ts';

export function TelemetryResourceName({
	availableResources,
	children,
	className,
	id,
	name,
	type,
}: {
	availableResources: TelemetryResourceAvailability;
	children?: ReactNode;
	className: string;
	id: string;
	name: string;
	type: TelemetryResourceType;
}) {
	const to = telemetryResourceLink(type, id, availableResources);
	const identityClassName = cn(machineLabelClass, className);
	const label = children ?? name;
	if (!to) {
		return (
			<span className={identityClassName} title={name}>
				{label}
			</span>
		);
	}
	return (
		<Link
			className={cn(touchTargetTextClass, identityClassName, 'hover:underline')}
			title={name}
			to={to}>
			{label}
		</Link>
	);
}

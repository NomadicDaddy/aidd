import { formatDate, formatRelativeAge } from '../../lib/formatters.ts';
import { Tooltip } from '../ui/tooltip.tsx';

/**
 * The one way this app writes an instant relative to now.
 *
 * `formatRelativeAge` was already shared; what was not shared was what to do with the exact
 * timestamp, and every surface answered differently — `12 Jul 2026, 14:03 (3d ago)` on one row,
 * `3d ago (12 Jul 2026, 14:03)` on the next, a bare `3d ago` with the exact value in a `title` on a
 * third, and a bare `3d ago` with the exact value nowhere at all on a fourth. Four spellings of one
 * fact, several of them spending half a table column on a precision nobody scanning a list needs.
 *
 * So: the relative age is the text, and the exact stamp is a named tooltip disclosure reachable by
 * focus and tap as well as hover. `<time dateTime>` also puts the machine-readable value in the DOM.
 * An unparseable or absent value renders the em dash `formatRelativeAge` already returns, as a plain
 * span — there is no instant to point a `<time>` at.
 */
export function RelativeAge({
	className,
	compact = false,
	value,
}: {
	className?: string;
	compact?: boolean;
	value: null | number | string | undefined;
}) {
	const parsed =
		value === null || value === undefined || value === '' ? NaN : new Date(value).getTime();
	if (!Number.isFinite(parsed))
		return <span className={className}>{formatRelativeAge(null)}</span>;
	const relative = formatRelativeAge(new Date(parsed).toISOString());
	return (
		<Tooltip
			content={formatDate(value)}
			disclosure
			disclosureLabel={`${relative}. Exact timestamp`}
			touchAlignment="start"
			touchTargetMode={compact ? 'overlay' : 'flow'}>
			<time className={className} dateTime={new Date(parsed).toISOString()}>
				{relative}
			</time>
		</Tooltip>
	);
}

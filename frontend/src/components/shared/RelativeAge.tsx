import { formatDate, formatRelativeAge } from '../../lib/formatters.ts';

/**
 * The one way this app writes "how long ago".
 *
 * `formatRelativeAge` was already shared; what was not shared was what to do with the exact
 * timestamp, and every surface answered differently — `12 Jul 2026, 14:03 (3d ago)` on one row,
 * `3d ago (12 Jul 2026, 14:03)` on the next, a bare `3d ago` with the exact value in a `title` on a
 * third, and a bare `3d ago` with the exact value nowhere at all on a fourth. Four spellings of one
 * fact, several of them spending half a table column on a precision nobody scanning a list needs.
 *
 * So: the relative age is the text, and the exact stamp is the tooltip. `<time dateTime>` puts the
 * machine-readable value in the DOM as well, which is the part a `title` alone cannot give a reader
 * who never hovers. An unparseable or absent value renders the em dash `formatRelativeAge` already
 * returns, as a plain span — there is no instant to point a `<time>` at.
 */
export function RelativeAge({
	className,
	value,
}: {
	className?: string;
	value: null | number | string | undefined;
}) {
	const parsed =
		value === null || value === undefined || value === '' ? NaN : new Date(value).getTime();
	if (!Number.isFinite(parsed))
		return <span className={className}>{formatRelativeAge(null)}</span>;
	const relative = formatRelativeAge(new Date(parsed).toISOString());
	return (
		<time
			className={className}
			dateTime={new Date(parsed).toISOString()}
			title={formatDate(value)}>
			{relative}
		</time>
	);
}

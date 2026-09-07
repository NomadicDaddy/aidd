/** A feature another live run has claimed for the duration of its iteration. */
export interface LeasedFeatureNotice {
	featureId: string;
	runId: string;
}

/**
 * Tell a run which feature records belong to a concurrent run right now.
 *
 * Coding runs coordinate through exclusive feature leases, so two of them cannot select the same
 * feature. Directive and skill runs select nothing and hold no lease, so without this they have no
 * idea another run is mid-flight: a `consolidate-features` directive can fold a feature into another
 * record and delete its directory while the coding run that claimed it is still implementing it.
 * That run then commits passing work and has its completion claim checked against a record that no
 * longer exists. aidd already knows which features are claimed — this is it saying so.
 *
 * Renders nothing when no other live run holds a lease, which keeps it out of every prompt snapshot
 * and out of the common single-run case.
 */
export function renderLeasedFeatures(leases: readonly LeasedFeatureNotice[]): string | undefined {
	if (leases.length === 0) return undefined;
	const rows = leases
		.map((lease) => `- \`${lease.featureId}\` — claimed by live run \`${lease.runId}\``)
		.join('\n');
	return (
		`## Features claimed by concurrent runs\n\n` +
		`Another aidd run is executing against this same working tree right now and has claimed ` +
		`the following feature record(s):\n\n${rows}\n\n` +
		`Treat each one as **owned by that run for the duration of your work**:\n\n` +
		`- Do **not** delete, rename, move, merge, consolidate, or fold its ` +
		`\`.aidd/features/<id>/\` directory into another record.\n` +
		`- Do **not** edit its \`feature.json\` — not its status, \`passes\`, spec, notes, ` +
		`dependencies, or title.\n` +
		`- Reading it is fine, and so is every other feature not listed above.\n\n` +
		`If your task genuinely requires changing a claimed record, leave that record alone, do the ` +
		`rest of the task, and say plainly in your summary which record you skipped and why. The ` +
		`other run is writing to these files as you read them; a change you make now is either ` +
		`lost or destroys work it has already verified.`
	);
}

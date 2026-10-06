/** The badge tone for a run status, shared by the runs, projects, dashboard and diary surfaces. */
export function runStatusTone(status: string): 'amber' | 'emerald' | 'neutral' | 'red' | 'teal' {
	if (status === 'completed' || status === 'success') return 'emerald';
	if (status === 'running') return 'teal';
	if (
		status === 'aborted' ||
		status === 'blocked' ||
		status === 'error' ||
		status === 'failed' ||
		status === 'killed'
	) {
		return 'red';
	}
	if (
		status === 'completed_with_failures' ||
		status === 'completed_with_warnings' ||
		status === 'stopped' ||
		status === 'stop_requested' ||
		status === 'warning'
	)
		return 'amber';
	return 'neutral';
}

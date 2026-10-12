import { describe, expect, test } from 'bun:test';
import { createAuditFreshnessContext } from 'aidd-shared/metadata/audit-freshness';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { simulationMarker, unavailableMarker } from 'aidd-shared/modes/audit-shared';

import { auditReportFreshness } from '../../backend/src/services/audit/auditReportFreshness.ts';
import { classifyAuditEntry } from '../../backend/src/services/maturity/artifactClassification.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

// A could-not-run report is on disk so its reason can be read, not as evidence. If a panel
// surface counted it, an audit nothing performed would show as fresh and never be run again.
describe('could-not-run reports on panel surfaces', () => {
	test('the maturity view and the shared panel read both treat the audit as unaudited', async () => {
		const projectDir = await testTempDir('aidd-panel-unavailable-');
		try {
			const store = new FileAiddStore(projectDir);
			await store.writeAuditReport(
				'LIGHTHOUSE',
				`${unavailableMarker}\n> **Audit could not run:** no artifact.\n\n# LIGHTHOUSE`,
			);
			const context = createAuditFreshnessContext();

			expect((await auditReportFreshness(projectDir, 'LIGHTHOUSE', context)).status).toBe(
				'missing',
			);
			const { artifact, entry } = await classifyAuditEntry(
				'LIGHTHOUSE',
				projectDir,
				new Set(),
				null,
				context,
			);
			expect(entry.freshness).toBe('missing');
			expect(artifact.status).toBe('missing');
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('a real report still reads fresh, and the last real report shows through', async () => {
		const projectDir = await testTempDir('aidd-panel-unavailable-behind-');
		try {
			const store = new FileAiddStore(projectDir);
			const earlier = new Date(Date.now() - 2 * 86_400_000);
			await store.writeAuditReport('SECURITY', '# SECURITY real report', earlier);
			await store.writeAuditReport('SECURITY', `${unavailableMarker}\n# SECURITY`);

			const freshness = await auditReportFreshness(
				projectDir,
				'SECURITY',
				createAuditFreshnessContext(),
			);
			expect(freshness.status).toBe('fresh');
			expect(freshness.report).toBe(`SECURITY-${earlier.toISOString().slice(0, 10)}.md`);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	// Pinned, not endorsed: the panel has always counted a simulated report, unlike the CLI's
	// audit selection. This change leaves that as it was.
	test('a simulated report still counts on panel surfaces', async () => {
		const projectDir = await testTempDir('aidd-panel-simulated-');
		try {
			await new FileAiddStore(projectDir).writeAuditReport(
				'SECURITY',
				`${simulationMarker}\n# SECURITY`,
			);
			const freshness = await auditReportFreshness(
				projectDir,
				'SECURITY',
				createAuditFreshnessContext(),
			);
			expect(freshness.status).toBe('fresh');
		} finally {
			await removeTempTree(projectDir);
		}
	});
});

import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'aidd-shared/args/index';
import { resolveMergedConfig } from 'aidd-shared/config';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { createCliActiveRunRecord } from 'aidd-shared/metadata/active-runs';
import { recoverStaleAuditArtifacts } from '../../backend/src/services/run/staleAuditRecovery.ts';
import { createModeHandler } from '../../cli/src/modes/factory.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

test.each([false, true])(
	'audit simulation marker follows plan simulation=%s, not inspected text',
	async (simulation) => {
		const projectDir = await testTempDir('aidd-audit-provenance-');
		try {
			const plan = resolveRunPlan(
				parseArgs([
					'--project-dir',
					projectDir,
					'--audit',
					'SECURITY',
					...(simulation ? ['--simulation'] : []),
				]),
				resolveMergedConfig({}),
			);
			const result = await createModeHandler(plan).processResult(
				{ projectDir, store: new FileAiddStore(projectDir) },
				{
					events: [],
					exitCode: 0,
					filesModified: [],
					transcript: simulation
						? ''
						: 'Inspected source containing: aidd native backend is installed.',
					selectedWork: { id: 'SECURITY', description: 'Run SECURITY audit' },
					structuredResult: {
						auditFindings: [],
						noFindingsJustification:
							'Inspected backend/src/routes.ts and verified every route validates its request body; no unchecked input remained.',
						reportMarkdown: '# SECURITY Audit Report\n\nValidated route inputs.',
					},
				},
			);
			const report = await readFile(String(result.artifacts?.reportPath), 'utf8');
			expect(report.includes('<!-- aidd:simulated -->')).toBe(simulation);
			const recovered = await recoverStaleAuditArtifacts(
				createCliActiveRunRecord({
					backend: 'codex',
					commandArgs: ['--audit', 'SECURITY', ...(simulation ? ['--simulation'] : [])],
					id: 'provenance-test',
					logPath: null,
					mode: 'audit',
					model: 'test',
					projectDir,
					provider: undefined,
					reasoningEffort: 'low',
					source: 'cli',
				}),
				{
					result: {
						auditFindings: [],
						noFindingsJustification:
							'Inspected backend/src/routes.ts and verified all input schemas reject unsafe paths; no unchecked request reached a file read.',
						reportMarkdown:
							'# SECURITY Audit Report\n\nSource says aidd native backend is installed.',
					},
				},
			);
			expect(recovered?.completedAudits).toEqual(['SECURITY']);
			const replayed = await readFile(String(result.artifacts?.reportPath), 'utf8');
			expect(replayed.includes('<!-- aidd:simulated -->')).toBe(simulation);
		} finally {
			await removeTempTree(projectDir);
		}
	},
);

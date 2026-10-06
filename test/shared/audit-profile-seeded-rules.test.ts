import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import type { AuditProfileOverrides } from '../../shared/src/contracts/audit-profile-mapping-types.ts';
import type { ProjectAssuranceProfile } from '../../shared/src/contracts/project-profile.ts';

import { isAuditApplicableToProject } from '../../shared/src/contracts/audit-profile-mapping.ts';
import { loadAuditProfileMapping } from '../../shared/src/metadata/audit-profile-mapping.ts';

const repoRoot = join(import.meta.dir, '..', '..');
const mapping = await loadAuditProfileMapping(repoRoot);
const noPackages = new Set<string>();

const local = {
	authMode: 'local_owner',
	bucket: 'single_user_local',
	criticality: 'utility',
	dataSensitivity: 'low',
	deployment: 'local',
	derivesFromTemplate: 'none',
	externalIntegrations: 'none',
	hasCliBinary: 'none',
	publishesReleaseArchives: 'none',
	shipsContainerImage: 'none',
	source: 'explicit',
	updatedAt: '2026-01-01T00:00:00.000Z',
} as ProjectAssuranceProfile;

function applies(
	profile: ProjectAssuranceProfile,
	audit: string,
	packages: ReadonlySet<string> = noPackages,
	overrides: AuditProfileOverrides | null = null,
): boolean {
	return isAuditApplicableToProject(profile, packages, audit, mapping, overrides);
}

const AGENT = ['AGENT_TOOL_SANDBOX', 'GIT_DESTRUCTIVE_SAFETY', 'ORCHESTRATOR_CONCURRENCY'];
const PROXY = ['PROXY_AUTH_BOUNDARY', 'OUTBOUND_SSRF', 'SECRET_HANDLING_RETENTION'];

// The seeded rules as fixed after the 2026-10-06 profile review: the proxy rule used to name every
// deployment and so beat the archive sweep, the agent audits followed bucket instead of agent use,
// and AI and SSOC applied to projects with no LLM client or React.
describe('seeded audit-profile rules', () => {
	test('an archive keeps only the hygiene audits; the proxy trio no longer beats the sweep', () => {
		const archive = { ...local, bucket: 'prototype_archive' } as ProjectAssuranceProfile;
		for (const audit of PROXY) expect(applies(archive, audit)).toBe(false);
		for (const audit of ['ASSERTIONS', 'DOCUMENTATION', 'HYGIENE']) {
			expect(applies(archive, audit)).toBe(true);
		}
		for (const audit of PROXY) expect(applies(local, audit)).toBe(true);
	});

	test('the agent audits are opt-in, whatever the bucket or integrations say', () => {
		const writeCapable = {
			...local,
			externalIntegrations: 'write_capable',
		} as ProjectAssuranceProfile;
		const team = { ...local, bucket: 'multi_user_local' } as ProjectAssuranceProfile;
		const optIn: AuditProfileOverrides = {
			audits: Object.fromEntries(AGENT.map((audit) => [audit, 'required'])),
			rules: [],
			updatedAt: '2026-01-01T00:00:00.000Z',
			version: 1,
		};
		for (const audit of AGENT) {
			expect(applies(local, audit)).toBe(false);
			expect(applies(writeCapable, audit)).toBe(false);
			expect(applies(team, audit, noPackages, optIn)).toBe(true);
		}
		// A write-capable local tool still runs the proxy, secret and security audits.
		for (const audit of [...PROXY, 'SECURITY']) expect(applies(writeCapable, audit)).toBe(true);
	});

	test('SSOC needs React and AI needs an LLM SDK, unless an override requires it', () => {
		expect(applies(local, 'SSOC')).toBe(false);
		expect(applies(local, 'SSOC', new Set(['react']))).toBe(true);
		expect(applies(local, 'AI')).toBe(false);
		expect(applies(local, 'AI', new Set(['@anthropic-ai/sdk']))).toBe(true);
		const httpClient: AuditProfileOverrides = {
			audits: { AI: 'required' },
			rules: [],
			updatedAt: '2026-01-01T00:00:00.000Z',
			version: 1,
		};
		expect(applies(local, 'AI', noPackages, httpClient)).toBe(true);
	});

	test('a project that distributes a build runs LICENSING even at low exposure', () => {
		expect(applies(local, 'LICENSING')).toBe(false);
		for (const distributes of [
			{ publishesReleaseArchives: 'binary_archives' },
			{ shipsContainerImage: 'published' },
			{ hasCliBinary: 'packaged_binary' },
		]) {
			expect(
				applies({ ...local, ...distributes } as ProjectAssuranceProfile, 'LICENSING'),
			).toBe(true);
		}
		const archive = {
			...local,
			bucket: 'prototype_archive',
			publishesReleaseArchives: 'binary_archives',
		} as ProjectAssuranceProfile;
		expect(applies(archive, 'LICENSING')).toBe(false);
	});
});

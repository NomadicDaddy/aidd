import { beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { findingDismissalReasons } from '../../frontend/src/api/types.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const FINDING = JSON.stringify({
	auditSource: 'SECURITY',
	fingerprint: `f1-${'c'.repeat(64)}`,
	id: 'audit-security-finding',
	passes: false,
	status: 'backlog',
	title: 'Missing route guard',
});

interface RenderedFindingDispositions {
	audits: string;
	dialog: string;
	features: string;
}

// A fingerprint without an auditSource cannot produce a ledger event, so the UI must offer the
// plain delete for it rather than a dismissal the backend would refuse.
const FINGERPRINT_ONLY = JSON.stringify({
	fingerprint: `f1-${'c'.repeat(64)}`,
	id: 'audit-security-finding',
	passes: false,
	status: 'backlog',
	title: 'Missing route guard',
});

function renderFindingDispositions(featureJson = FINDING): RenderedFindingDispositions {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { AuditFindingList } from './src/pages/projects/detail/auditRowContent.tsx';",
		"import { BacklogFeatureActions } from './src/pages/projects/detail/FeatureActionVariants.tsx';",
		"import { FindingDismissalDialog } from './src/pages/projects/detail/FindingDismissalDialog.tsx';",
		`const feature = ${featureJson};`,
		'const noop = () => undefined;',
		'const features = createElement(BacklogFeatureActions, { disabled: false, feature, inventory: [feature], launching: false, onDelete: noop, onLaunchRun: noop, onSelect: noop, onStatusChange: noop, runActive: false });',
		"const audits = createElement(AuditFindingList, { auditName: 'SECURITY', dismissPending: false, findings: [feature], onDismiss: noop });",
		'const dialog = createElement(FindingDismissalDialog, { feature, isPending: false, onClose: noop, onConfirm: noop });',
		'console.log(JSON.stringify({ audits: renderToStaticMarkup(audits), dialog: renderToStaticMarkup(dialog), features: renderToStaticMarkup(features) }));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as RenderedFindingDispositions;
}

let rendered: RenderedFindingDispositions;
let renderedFingerprintOnly: RenderedFindingDispositions;

beforeAll(() => {
	rendered = renderFindingDispositions();
	renderedFingerprintOnly = renderFindingDispositions(FINGERPRINT_ONLY);
});

describe('finding disposition controls', () => {
	test('uses the shared closed reason vocabulary', () => {
		expect(findingDismissalReasons).toEqual([
			'already-handled',
			'false-positive',
			'not-worth-it',
			'wrong-severity',
			'other',
		]);
	});

	test('replaces bare Delete with Dismiss for fingerprinted feature rows', () => {
		expect(rendered.features).toContain('aria-label="Dismiss audit-security-finding"');
		expect(rendered.features).toContain('>Dismiss</button>');
		expect(rendered.features).not.toContain('>Delete</button>');
	});

	test('offers Dismiss beside active findings in the Audits tab', () => {
		expect(rendered.audits).toContain('aria-label="Dismiss audit-security-finding"');
	});

	test('keeps plain Delete for a fingerprint that has no auditSource', () => {
		expect(renderedFingerprintOnly.features).toContain(
			'aria-label="Delete audit-security-finding"',
		);
		expect(renderedFingerprintOnly.features).not.toContain('>Dismiss</button>');
		expect(renderedFingerprintOnly.audits).not.toContain('aria-label="Dismiss');
	});

	test('renders the required reason picker and optional note in the dismissal dialog', () => {
		expect(rendered.dialog).toContain('Select a reason');
		expect(rendered.dialog).toContain('False positive');
		expect(rendered.dialog).toContain('Note (optional)');
	});
});

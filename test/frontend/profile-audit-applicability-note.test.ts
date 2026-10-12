import { describe, expect, test } from 'bun:test';

import { auditApplicabilityNote } from '../../frontend/src/lib/auditPresentation.ts';

describe('the profile preview says why an audit is on or off', () => {
	test('an audit that does not apply shows its reason verbatim', () => {
		expect(
			auditApplicabilityNote({
				applies: false,
				effect: 'default',
				name: 'FRONTEND',
				reason: 'requires a web frontend; none detected',
				surface: { name: 'web-frontend', present: false, undecided: false },
			}),
		).toEqual({ text: 'requires a web frontend; none detected', tone: 'muted' });
	});

	test('an audit switched off by policy, with no reason, gets no line', () => {
		expect(
			auditApplicabilityNote({ applies: false, effect: 'excluded', name: 'SECURITY' }),
		).toBeNull();
		expect(
			auditApplicabilityNote({ applies: true, effect: 'default', name: 'SECURITY' }),
		).toBeNull();
	});

	test('a found surface is named with its evidence', () => {
		expect(
			auditApplicabilityNote({
				applies: true,
				effect: 'default',
				name: 'FRONTEND',
				surface: {
					evidence: 'declares react in frontend/package.json',
					name: 'web-frontend',
					present: true,
					undecided: false,
				},
			}),
		).toEqual({
			text: 'web frontend found: declares react in frontend/package.json',
			tone: 'muted',
		});
	});

	test('only the undecided flag makes the line amber, whatever the evidence says', () => {
		const evidence = 'file scan incomplete: it stopped at its limit of 5000 entries';
		expect(
			auditApplicabilityNote({
				applies: true,
				effect: 'default',
				name: 'DATABASE',
				surface: { evidence, name: 'database', present: true, undecided: true },
			}),
		).toEqual({
			text: `Applies because detection could not finish: ${evidence}`,
			tone: 'amber',
		});
		expect(
			auditApplicabilityNote({
				applies: true,
				effect: 'default',
				name: 'DATABASE',
				surface: { evidence, name: 'database', present: true, undecided: false },
			})?.tone,
		).toBe('muted');
	});

	test('an audit required over an absent surface reads as a decision, not a warning', () => {
		expect(
			auditApplicabilityNote({
				applies: true,
				effect: 'required',
				name: 'LIGHTHOUSE',
				surface: { name: 'web-frontend', present: false, undecided: false },
			}),
		).toEqual({ text: 'Required by override; no web frontend detected', tone: 'muted' });
	});
});

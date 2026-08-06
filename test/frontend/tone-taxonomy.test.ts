import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { effectTone } from '../../frontend/src/pages/audits/auditsUtils.ts';
import { toneBadge } from '../../frontend/src/lib/tones.ts';
import { statusTone } from '../../frontend/src/pages/projects/detail/shared.ts';
import { artifactTone, syncTone } from '../../frontend/src/pages/projects/projects-list-shared.ts';

const pagesRoot = join(process.cwd(), 'frontend', 'src', 'pages');

function source(...segments: string[]): Promise<string> {
	return Bun.file(join(pagesRoot, ...segments)).text();
}

// Each purged site left a comment saying why the tone went away, and those comments say the word
// "tone" — so an absence assertion has to read the code and not the prose explaining it.
function codeOnly(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

// The taxonomy sites: every one of them answers "what kind of thing is this?" rather than "is this
// healthy?". Colouring them spent the six-value status scale on facts that are never wrong, so a
// correctly-configured project rendered red, amber and violet chips while nothing needed attention.
// Each entry names the badge as it appears in source, so re-toning one of them fails here.
const taxonomyBadges: { file: string[]; snippets: string[] }[] = [
	{
		file: ['runs', 'PipelineSessionRow.tsx'],
		snippets: [
			`<Badge tone="neutral">{isSkillSession(session) ? 'Skill' : 'Pipeline'}</Badge>`,
		],
	},
	{
		file: ['runs', 'PipelineStepSubRows.tsx'],
		snippets: ['<Badge tone="neutral">{stepTypeLabel(row.step.stepType)}</Badge>'],
	},
	{
		file: ['pipelineSessions', 'StepRows.tsx'],
		snippets: ['<Badge tone="neutral">{stepTypeLabel(step.stepType)}</Badge>'],
	},
	{
		file: ['projects', 'ProjectStackDisplay.tsx'],
		snippets: ['<Badge tone="neutral">{stack.label}</Badge>'],
	},
	{
		file: ['projects', 'detail', 'MaturityArtifactRow.tsx'],
		snippets: ['<Badge tone="neutral">required</Badge>'],
	},
	{
		file: ['projects', 'profileMatrix', 'ProfileMatrixRow.tsx'],
		snippets: ['<Badge tone="neutral">{row.posture.label}</Badge>'],
	},
	{
		file: ['projects', 'profileMatrix', 'ProfileMatrixMobileList.tsx'],
		snippets: ['<Badge tone="neutral">{row.posture.label}</Badge>'],
	},
	{
		file: ['director', 'DirectorProfileSection.tsx'],
		snippets: ['<Badge tone="neutral">Own record'],
	},
];

describe('tone taxonomy', () => {
	test('renders kind, posture, stack and step type without a status tone', async () => {
		const offenders: string[] = [];
		for (const { file, snippets } of taxonomyBadges) {
			const text = await source(...file);
			for (const snippet of snippets) {
				if (!text.includes(snippet)) offenders.push(`${file.join('/')} — ${snippet}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	test('keeps audit applicability and project audit state off the status scale', async () => {
		// Every applicability effect is somebody's deliberate policy, `excluded` most of all: it is
		// the ordinary answer for the Archive bucket, so a red cell there read as a wall of failures.
		expect(Object.values(effectTone)).toEqual(['neutral', 'neutral', 'neutral', 'neutral']);

		const auditsTab = await source('projects', 'detail', 'auditsTabUtils.tsx');
		expect(auditsTab).not.toMatch(/tone="(?:amber|emerald|red|teal|violet)"/);
		// Colour was never the only signal on this column — each state still says its own word, and
		// the invariant majority state is plain text rather than a badge that says nothing.
		for (const label of ['Overridden on', 'Overridden off', 'Profile-disabled', 'Disabled']) {
			expect(auditsTab).toContain(label);
		}
		expect(auditsTab).toContain(
			'<span className="text-xs text-muted-foreground">Enabled</span>',
		);
	});

	test('leaves recipe policy chips untoned and keeps violet for the system contract', async () => {
		const policy = await source('recipes', 'recipe-policy.ts');
		// The field is gone, not set to neutral: an always-neutral mapping is an invitation to put
		// the colour back one chip at a time.
		expect(codeOnly(policy)).not.toContain('tone');

		const badges = await source('recipes', 'RecipeMetadataBadges.tsx');
		expect(badges).toContain('<RecipeBadgeTooltip content={badge.explainer} key={badge.key}>');
		// `system` survives because violet means system-managed everywhere else in the shell; it is
		// the one contract fact the shell owns rather than the operator.
		expect(badges).toContain('tone="violet"');
	});

	test('has no bucket tone left to reintroduce', async () => {
		const glob = new Bun.Glob('**/*.{ts,tsx}');
		const offenders: string[] = [];
		for await (const file of glob.scan({ absolute: false, cwd: pagesRoot, onlyFiles: true })) {
			const text = codeOnly(await Bun.file(join(pagesRoot, file)).text());
			if (text.includes('profileBucketTone')) offenders.push(file.replaceAll('\\', '/'));
		}
		expect(offenders).toEqual([]);

		const helpers = await source('projects', 'profile', 'profile-helpers.ts');
		expect(codeOnly(helpers)).not.toContain('tone');
	});

	test('leaves the health readings toned', () => {
		// The purge is call-site discipline, not a retreat from colour: anything that can actually be
		// wrong still says so, or the screens would lose the signal instead of sharpening it.
		expect(syncTone('error')).toBe('red');
		expect(syncTone('syncing')).toBe('teal');
		expect(syncTone('idle')).toBe('emerald');
		expect(artifactTone.missing).toBe('red');
		expect(artifactTone.stale).toBe('amber');
		expect(artifactTone.fresh).toBe('emerald');
		expect(statusTone('waiting_approval')).toBe('amber');
	});

	test('leaves the scale itself intact', () => {
		expect(Object.keys(toneBadge).sort()).toEqual([
			'amber',
			'emerald',
			'neutral',
			'red',
			'teal',
			'violet',
		]);
	});
});

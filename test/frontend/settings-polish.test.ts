import { describe, expect, test } from 'bun:test';

import { backendProbeLine } from '../../frontend/src/pages/settings/backendProbeLine.ts';

/**
 * `remediation-20260805-polish-settings`, spec items 1-9.
 *
 * Each test states the finding it closes, so a later change that reopens one fails against the
 * reason rather than against a class string nobody can place.
 */
const settings = async (file: string): Promise<string> =>
	await Bun.file(`${import.meta.dir}/../../frontend/src/pages/settings/${file}`).text();

describe('settings polish', () => {
	test('tones a probe failure apart from a version string', async () => {
		const table = await settings('BackendDefaultsTable.tsx');
		const probe = await settings('backendProbeLine.ts');

		// The status the probe already reports decides the tone — there is no second
		// classification of the message text here.
		expect(probe).toContain(
			"if (status.status === 'unavailable') return { text: detail, toneClass: toneText.red };",
		);
		expect(probe).toContain(
			"if (status.status === 'missing') return { text: detail, toneClass: toneText.amber };",
		);
		// The version stays muted: it is the nine rows that need nothing done to them.
		expect(probe).toContain(
			'if (/\\d/u.test(version)) return { text: version, toneClass: muted };',
		);
		expect(table).toContain('font-mono text-xs break-words @min-[61rem]:truncate');
	});

	test('omits a probe version that carries no digits', async () => {
		const table = await settings('BackendDefaultsTable.tsx');
		const probe = await settings('backendProbeLine.ts');

		// lmstudio answers `--version` with a box-drawing banner; stripped of its ANSI that is a
		// row of underscores, which read as a rendering fault rather than as an unhelpful probe.
		expect(probe).toContain('const ansiSgrPattern =');
		expect(probe).toContain('function backendProbeLine(');
		expect(probe).toMatch(/A version is only a version if it contains a digit/u);
		// The raw field is never the rendered line: it goes through backendProbeLine first.
		expect(table).not.toContain('{status.version}');
	});

	test('does not repeat the healthy status as its probe detail', () => {
		expect(
			backendProbeLine({
				authStatus: null,
				backend: 'codex',
				command: 'codex --version',
				detail: 'Available',
				status: 'available',
				version: null,
			}),
		).toEqual({ text: 'Version not reported', toneClass: 'text-muted-foreground' });
	});

	test('says "a credential is stored" one way in all three places', async () => {
		const badge = await Bun.file(
			`${import.meta.dir}/../../frontend/src/components/shared/CredentialBadge.tsx`,
		).text();
		const providers = await settings('ProviderConfigSection.tsx');
		const directAi = await settings('DirectAiSection.tsx');
		const telegram = await settings('TelegramChannelSection.tsx');

		expect(badge).toContain("pendingState?.tone ?? (configured ? 'emerald' : 'neutral')");
		expect(badge).toContain("configuration: { configured: 'Configured', empty: 'Not set' }");
		expect(badge).toContain("context = 'configuration'");
		expect(providers).toContain('<CredentialBadge configured={');
		expect(directAi).toContain('<CredentialBadge configured={');
		// Telegram renders it only once there is something to say through FieldRow's shared hint
		// slot, which owns the sibling placement and `aria-describedby` association.
		expect(telegram).toMatch(/<CredentialBadge[\s\S]*configured=\{effectiveConfigured\}/u);
		expect(telegram).toMatch(/<FieldRow[\s\S]*hint=\{[\s\S]*showCredentialState \? \(/u);
		// The three vocabularies this replaced. None of them renders anywhere now.
		expect(providers).not.toContain('Key configured');
		expect(directAi).not.toContain('API key configured');
		// The coloured sentence is gone with the tone import that painted it — matched on the
		// import, since the comment above the badge still quotes the sentence it replaced.
		expect(telegram).not.toContain("from '../../lib/tones.ts'");
	});

	test('keeps Run Limits fields one shape without isolated config-key captions', async () => {
		const limits = await settings('RunLimitsSection.tsx');

		// Two of sixteen controls printed their config key and became taller than their peers. The
		// page header already names the config file; the card now presents every field consistently.
		expect(limits).not.toContain('function ConfigKey');
		expect(limits).not.toContain('configKey=');
		expect(limits).toContain('grid-cols-[repeat(3,minmax(0,20rem))]');
	});

	test('keeps checkbox help text in the one slot the shared field owns', async () => {
		const field = await Bun.file(
			`${import.meta.dir}/../../frontend/src/components/ui/field.tsx`,
		).text();

		expect(field).toContain('description?: ReactNode;');
		expect(field).toContain('There is exactly one place for it, and this is it.');
		// The box owns the description, so it cannot be rendered as a sibling outside the border.
		expect(field).toMatch(/description \? 'items-start' : 'min-h-9 items-center'/u);
	});

	test('styles both tables on the surface with one column-header treatment', async () => {
		const backends = await settings('BackendDefaultsTable.tsx');
		const metrics = await settings('SystemMetricsVitals.tsx');

		for (const surface of [backends, metrics]) {
			expect(surface).toContain("import { tableHeadClass } from '../../lib/tableStyles.ts';");
			expect(surface).toContain('<thead className={tableHeadClass}>');
		}
		// Two cards apart on one surface, with a different case, weight and background each.
		expect(metrics).not.toContain('<thead className="');
		expect(backends).not.toContain('<thead className="');
	});

	test('gives every rating a word rather than a bare dot', async () => {
		const metrics = await settings('SystemMetricsVitals.tsx');

		// The screen-reader text was already correct; sighted readers were the ones getting a
		// 6px hue with no legend anywhere on the surface.
		expect(metrics).toContain('function RatingBadge(');
		expect(metrics).toContain("<Badge showDot tone={ratingTone[rating] ?? 'neutral'}>");
		expect(metrics).toContain('<RatingBadge rating={vital.latestRating} />');
		expect(metrics).not.toContain('toneSolid');
	});

	test('lets the ListEditor own its add label', async () => {
		const list = await settings('ListEditor.tsx');

		// One visible word; the noun that says which list it is lives on the accessible name.
		expect(list).toContain('aria-label={`Add ${label} entry`}');
		expect(list).toMatch(/>\s*Add\s*</u);
	});

	test('marks the sticky toolbar edge with a border rather than a shadow', async () => {
		const toolbar = await settings('SettingsToolbar.tsx');

		// Nothing else on Settings is lifted off the page, so the shadow gave this one card a
		// z-axis the rest of the surface does not have.
		expect(toolbar).toContain('border-b-2 border-border');
		// Matched inside the class list, not in the file: the comment above the Card names the
		// utility it dropped, and that sentence is worth keeping.
		expect(toolbar).not.toMatch(/className="[^"]*shadow-md/u);
	});

	test('keeps the Badge Lab rows one shape', async () => {
		const lab = await settings('ExecutionIdentityCatalogSections.tsx');

		// Three of eleven entries carry a display name; loose in the wrap flow it reads as debris
		// beside the eight that carry nothing. It rides the chip's own tooltip, which is reachable
		// by keyboard and by touch — a native `title` is neither.
		expect(lab).toContain('function cliDisplayTitle(');
		expect(lab).toContain('hint={cliDisplayTitle(cli)}');
		expect(lab).not.toContain('title={cliDisplayTitle(cli)}');
	});
});

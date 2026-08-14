import type { RepositoryInfo, RepositoryLanguage } from '../../../api/types.ts';

import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { cn } from '../../../lib/cn.ts';
import { formatBytes, formatCount } from '../../../lib/formatters.ts';
import { toneSolid } from '../../../lib/tones.ts';
import { logoForLanguage } from './repositoryLogos.ts';

// `mono` is for the rows whose value is a git ref rather than a number. The branch name sat in the
// same proportional face as 'Size on disk' two rows below it, on a card where the commit hash under
// them both was mono — one repository, two spellings of the same kind of thing.
function Stat({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-1">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd
				className={cn(
					'text-right text-sm font-medium text-foreground',
					mono ? 'font-mono break-all' : 'tabular-nums',
				)}>
				{value}
			</dd>
		</div>
	);
}

function LanguageBar({ language, total }: { language: RepositoryLanguage; total: number }) {
	const pct = total > 0 ? Math.max(2, Math.round((language.lines / total) * 100)) : 0;
	return (
		<li className="space-y-1">
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-sm text-foreground">{language.language}</span>
				<span className="text-xs text-muted-foreground tabular-nums">
					{formatCount(language.lines)} lines · {formatCount(language.files)} files
				</span>
			</div>
			<div className="h-1.5 overflow-hidden rounded-full bg-muted">
				<div
					className={`h-full rounded-full ${toneSolid.teal}`}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</li>
	);
}

function MetadataPanel({ info }: { info: RepositoryInfo }) {
	const codeLines = info.languages.reduce((sum, lang) => sum + lang.lines, 0);
	const topLanguages = info.languages.slice(0, 6);
	const commit = info.latestCommit;
	return (
		// Capped at 48rem. `flex-1` with no ceiling put 'Current branch' at x=555 and 'main' at
		// x=2170 on a 2250px viewport — 1600px of hairline between a label and its value, six rows
		// of it — and stretched the language bars onto a ~1470px track, where TypeScript's 244,086
		// lines filled the bar and JSON's 4,120 and HTML's 2,740 were a 2px and a 1px stub. The
		// comparison the bars exist to make only survives on a track the eye can cross.
		<div className="min-w-0 flex-1 space-y-4 xl:max-w-[48rem]">
			<dl className="divide-y divide-border/70">
				<Stat label="Current branch" mono value={info.currentBranch} />
				<Stat
					label="Branches"
					value={`${formatCount(info.localBranches)} local · ${formatCount(info.remoteBranches)} remote`}
				/>
				<Stat label="Tags" value={formatCount(info.tags)} />
				<Stat label="Tracked files" value={formatCount(info.totalFiles)} />
				<Stat
					label="Lines of code"
					value={`${formatCount(info.totalLines)}${info.truncated ? '+' : ''}`}
				/>
				<Stat label="Size on disk" value={formatBytes(info.sizeBytes)} />
			</dl>

			{commit ? (
				<div className="space-y-1 rounded-md border border-border/70 bg-muted/70 p-3">
					<div className="flex items-center justify-between gap-2">
						<span className="text-xs text-muted-foreground">Latest commit</span>
						<code className="font-mono text-xs text-foreground">
							{commit.hash.slice(0, 8)}
						</code>
					</div>
					<p className="truncate text-sm text-foreground">
						{commit.subject || '(no message)'}
					</p>
					<p className="text-xs text-muted-foreground">
						{commit.authorName} · <RelativeAge value={commit.date} />
					</p>
				</div>
			) : null}

			{info.authors.length > 0 ? (
				<div className="space-y-1">
					<h4 className="text-sm font-semibold text-foreground">Top contributors</h4>
					<ul className="space-y-0.5">
						{info.authors.map((author) => (
							<li
								className="flex items-baseline justify-between gap-3 text-sm"
								key={`${author.name}-${author.email}`}>
								<span className="truncate text-foreground">{author.name}</span>
								<span className="text-xs text-muted-foreground tabular-nums">
									{formatCount(author.commits)} commits
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}

			{topLanguages.length > 0 ? (
				<div className="space-y-2">
					<h4 className="text-sm font-semibold text-foreground">Languages</h4>
					<ul className="space-y-2">
						{topLanguages.map((language) => (
							<LanguageBar
								key={language.language}
								language={language}
								total={codeLines}
							/>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}

export function RepositoryInfoCard({ info }: { info: RepositoryInfo }) {
	const logo = logoForLanguage(info.dominantLanguage);
	return (
		// Titled, like the Working tree card above it. Two of this tab's four cards opened with no
		// heading at all, so the tab's heading order ran h2 Repository, h3 Working tree, h4 Top
		// contributors — a card's inner label standing in for the card's own name.
		<Card className="flex flex-col gap-5">
			<CardHeader
				description="Counted from the git-tracked files in the working copy."
				headingLevel={3}
				title="Repository statistics"
			/>
			<div className="flex flex-col gap-5 xl:flex-row xl:items-start">
				{/* self-start, and beside the statistics only from xl: as a stretched 16rem column
				    the identity panel matched the full height of the statistics list, so a mark and
				    two short lines of text owned the largest, emptiest box on the tab. */}
				<div className="flex items-center gap-4 self-start rounded-md border border-border/70 bg-muted/70 p-4 xl:w-64 xl:shrink-0 xl:flex-col xl:justify-center xl:p-5">
					<pre
						aria-hidden="true"
						className={`overflow-hidden text-[10px] leading-[1.15] font-bold ${logo.accent}`}>
						{logo.art}
					</pre>
					<div className="min-w-0 xl:text-center">
						<p className="text-sm font-semibold text-foreground">
							{info.dominantLanguage ?? 'Repository'}
						</p>
						<p className="text-xs text-muted-foreground">
							{info.dominantLanguage ? 'Dominant language' : 'No source detected'}
						</p>
					</div>
				</div>
				<MetadataPanel info={info} />
			</div>
		</Card>
	);
}

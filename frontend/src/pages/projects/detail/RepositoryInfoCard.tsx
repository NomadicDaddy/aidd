import type { RepositoryInfo, RepositoryLanguage } from '../../../api/types.ts';

import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { formatBytes, formatCount } from '../../../lib/formatters.ts';
import { tableColumnClass } from '../../../lib/tableStyles.ts';
import { toneSolid } from '../../../lib/tones.ts';
import { logoForLanguage } from './repositoryLogos.ts';
import { RepositoryPanelHeading } from './RepositoryPanelHeading.tsx';

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-1">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="text-right text-sm font-medium text-foreground tabular-nums">{value}</dd>
		</div>
	);
}

function LanguageBar({ language, topLines }: { language: RepositoryLanguage; topLines: number }) {
	const share = topLines > 0 ? (language.lines / topLines) * 100 : 0;
	const isLongTail = language.lines > 0 && share < 2;
	return (
		<li className="space-y-1">
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-sm text-foreground">{language.language}</span>
				<span className="text-xs text-muted-foreground tabular-nums">
					{formatCount(language.lines)} lines · {formatCount(language.files)} files
				</span>
			</div>
			<div className="h-1.5 overflow-hidden rounded-sm bg-muted">
				<div
					className={`h-full rounded-sm ${toneSolid.teal}`}
					data-scale={isLongTail ? 'long-tail' : 'linear'}
					style={isLongTail ? { width: '0.75rem' } : { width: `${share}%` }}>
					{isLongTail ? (
						<span className="sr-only">Less than 2% of the leading language</span>
					) : null}
				</div>
			</div>
		</li>
	);
}

function MetadataPanel({ info }: { info: RepositoryInfo }) {
	const topLanguages = info.languages.slice(0, 6);
	const topLanguageLines = topLanguages[0]?.lines ?? 0;
	const languageSummary =
		info.languages.length > topLanguages.length
			? `Showing the top ${formatCount(topLanguages.length)} of ${formatCount(info.languages.length)} detected languages.`
			: undefined;
	const commit = info.latestCommit;
	const hasBreakdowns = info.authors.length > 0 || topLanguages.length > 0;
	return (
		// One column keeps to the 48rem reading measure. Once the card itself clears
		// 61rem, the breakdowns receive a second measured column instead of leaving empty space below
		// the language mark.
		<div
			className={`grid max-w-[48rem] min-w-0 flex-1 gap-5 @min-[61rem]:gap-8 ${
				hasBreakdowns
					? '@min-[61rem]:max-w-none @min-[61rem]:grid-cols-[minmax(0,48rem)_minmax(0,48rem)]'
					: ''
			}`}>
			<div className="max-w-[32rem] min-w-0 space-y-4">
				<RepositoryPanelHeading title="Snapshot" />
				<dl className="max-w-[32rem] divide-y divide-border/70">
					<Stat label="Tags" value={formatCount(info.tags)} />
					<Stat label="Tracked files" value={formatCount(info.totalFiles)} />
					<Stat
						label="Lines of code"
						value={`${formatCount(info.totalLines)}${info.truncated ? '+' : ''}`}
					/>
					<Stat label="Size on disk" value={formatBytes(info.sizeBytes)} />
				</dl>

				{commit ? (
					<Card className="space-y-1 p-3" variant="sunken">
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs text-muted-foreground">Latest commit</span>
							<code className="font-mono text-xs text-foreground">
								{commit.hash.slice(0, 8)}
							</code>
						</div>
						<p className="text-sm break-words text-foreground" title={commit.subject}>
							{commit.subject || '(no message)'}
						</p>
						<p className="text-xs text-muted-foreground">
							{commit.authorName} · <RelativeAge compact value={commit.date} />
						</p>
					</Card>
				) : null}
			</div>

			{hasBreakdowns ? (
				<div className="max-w-[48rem] min-w-0 space-y-4">
					{info.authors.length > 0 ? (
						<div className="space-y-1">
							<RepositoryPanelHeading
								count={info.authors.length}
								title="Top contributors"
							/>
							<ul className="max-w-[32rem] space-y-0.5">
								{info.authors.map((author) => (
									<li
										className="flex items-baseline justify-between gap-3 text-sm"
										key={`${author.name}-${author.email}`}>
										<span className="truncate text-foreground">
											{author.name}
										</span>
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
							<RepositoryPanelHeading
								count={info.languages.length}
								description={languageSummary}
								title="Languages"
							/>
							<ul className="max-w-[32rem] space-y-2">
								{topLanguages.map((language) => (
									<LanguageBar
										key={language.language}
										language={language}
										topLines={topLanguageLines}
									/>
								))}
							</ul>
						</div>
					) : null}
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
		<Card className={`@container flex flex-col gap-5 ${tableColumnClass}`}>
			<CardHeader
				description="Counted from the git-tracked files in the working copy."
				headingLevel={3}
				title="Repository statistics"
			/>
			<div className="flex flex-col gap-5 @min-[48rem]:flex-row @min-[48rem]:items-start">
				{/* self-start, and beside the statistics only once the card clears 48rem: as a stretched 16rem column
				    the identity panel matched the full height of the statistics list, so a mark and
				    two short lines of text owned the largest, emptiest box on the tab. */}
				<Card
					className="flex w-full items-center gap-4 p-4 @min-[48rem]:w-64 @min-[48rem]:shrink-0 @min-[48rem]:flex-col @min-[48rem]:justify-center @min-[48rem]:p-5"
					variant="sunken">
					<pre
						aria-hidden="true"
						className={`overflow-hidden text-[10px] leading-[1.15] font-bold ${logo.accent}`}>
						{logo.art}
					</pre>
					<div className="min-w-0 @min-[48rem]:text-center">
						<p className="text-sm font-semibold text-foreground">
							{info.dominantLanguage ?? 'Repository'}
						</p>
						<p className="text-xs text-muted-foreground">
							{info.dominantLanguage ? 'Dominant language' : 'No source detected'}
						</p>
					</div>
				</Card>
				<MetadataPanel info={info} />
			</div>
		</Card>
	);
}

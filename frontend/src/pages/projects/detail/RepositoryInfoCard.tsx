import type { RepositoryInfo, RepositoryLanguage } from '../../../api/types.ts';

import { Card } from '../../../components/ui/card.tsx';
import {
	formatBytes,
	formatCount,
	formatDate,
	formatRelativeAge,
} from '../../../lib/formatters.ts';
import { logoForLanguage } from './repositoryLogos.ts';

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-1">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="text-right text-sm font-medium text-foreground tabular-nums">{value}</dd>
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
					className="h-full rounded-full bg-teal-500/80 dark:bg-teal-400/80"
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
		<div className="flex-1 space-y-4">
			<dl className="divide-y divide-border/70">
				<Stat label="Current branch" value={info.currentBranch} />
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
						<code className="text-xs text-foreground">{commit.hash.slice(0, 8)}</code>
					</div>
					<p className="truncate text-sm text-foreground">
						{commit.subject || '(no message)'}
					</p>
					<p className="text-xs text-muted-foreground">
						{commit.authorName} · {formatRelativeAge(commit.date)}
						{commit.date ? ` (${formatDate(commit.date)})` : ''}
					</p>
				</div>
			) : null}

			{info.authors.length > 0 ? (
				<div className="space-y-1">
					<h4 className="text-xs font-semibold text-foreground">Top contributors</h4>
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
					<h4 className="text-xs font-semibold text-foreground">Languages</h4>
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
		<Card className="flex flex-col gap-5 md:flex-row md:items-stretch">
			<div className="flex flex-col items-center justify-center gap-3 rounded-md border border-border/70 bg-muted/70 p-5 md:w-64 md:shrink-0">
				<pre
					aria-hidden="true"
					className={`overflow-hidden text-[10px] leading-[1.15] font-bold ${logo.accent}`}>
					{logo.art}
				</pre>
				<div className="text-center">
					<p className="text-sm font-semibold text-foreground">
						{info.dominantLanguage ?? 'Repository'}
					</p>
					<p className="text-xs text-muted-foreground">
						{info.dominantLanguage ? 'Dominant language' : 'No source detected'}
					</p>
				</div>
			</div>
			<MetadataPanel info={info} />
		</Card>
	);
}

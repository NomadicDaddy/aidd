import { type ParseContext, type ParsedArgs } from '../types.ts';

export function applyAuditFlags(
	flag: string,
	args: ParsedArgs,
	i: number,
	ctx: ParseContext,
): null | number {
	switch (flag) {
		case '--audit':
			args.auditMode = true;
			args.auditNames = ctx.parseList(ctx.requireValue(i, flag));
			return i + 2;
		case '--audit-all':
			args.auditMode = true;
			args.auditAll = true;
			return i + 1;
		case '--audit-findings': {
			// Opt-in coding sweep; optional SOURCE operand consumed only when the next token is not another flag (like `--interview [file]`).
			args.auditFindings = true;
			const next = ctx.argv[i + 1];
			if (next !== undefined && !next.startsWith('--')) {
				args.auditFindingsSource = next;
				return i + 2;
			}
			return i + 1;
		}
		case '--audit-on-completion':
			args.auditOnCompletionNames = ctx.parseList(ctx.requireValue(i, flag));
			return i + 2;
		case '--code-after-audit':
			args.codeAfterAudit = true;
			return i + 1;
		case '--complexity-tiering':
			args.complexityTiering = true;
			return i + 1;
		case '--consistency-gate':
			args.consistencyGate = true;
			return i + 1;
		case '--feature':
			args.feature = ctx.requireValue(i, flag);
			return i + 2;
		case '--filter':
			args.filterValue = ctx.requireValue(i, flag);
			return i + 2;
		case '--filter-by':
			args.filterBy = ctx.requireValue(i, flag);
			return i + 2;
		case '--init-git-after-scaffold':
			args.initGitAfterScaffold = true;
			return i + 1;
		case '--milestone':
			args.milestone = ctx.requireValue(i, flag);
			return i + 2;
		case '--simulation':
			args.simulation = true;
			return i + 1;
		case '--worktree':
			args.worktree = true;
			return i + 1;
		case '--write-allowlist':
			args.writeAllowlist = ctx.parseList(ctx.requireValue(i, flag));
			return i + 2;
		default:
			return null;
	}
}

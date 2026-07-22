export function printHelp(): void {
	console.log(`aidd v2

Usage: bun run start -- [OPTIONS]

Subcommands:
  new <github-url | owner/repo[#ref]> [--name NAME] [--root DIR]
      create a project from a GitHub template repo (degit semantics: fresh history)

Key options:
  --cli native|ollama|lmstudio|openai|claude-code|opencode|kilocode|codex|grok
  --project-dir DIR
  --spec FILE
  --stop-before-implementation
      finish initializer/onboarding after the persisted blueprint; do not start feature coding
  --max-iterations N
  --max-cost-usd N            warn (don't stop) when run cost exceeds N USD
  --max-tokens N              warn (don't stop) when run tokens (in+out) exceed N
  --timeout N
  --idle-timeout N
  --idle-nudge-timeout N
  --continue-on-timeout      continue after idle timeouts and transient provider errors (default)
  --no-continue-on-timeout   stop after timeout-style or transient provider failures
  --quit-on-abort N
  --dirty-tree-threshold N    skip run if working tree has more than N dirty files (default 50)
  --no-work-backoff-ms N      sleep N ms when an iteration finds no work (default 30000; 0 disables)
  --stop-when-done
  --no-stop-when-done
  --no-clean
  --todo
  --validate
  --in-progress
  --prompt "DIRECTIVE"
  --skill SKILL_ID [--skill-args "ARGS"]
  --audit AUDIT[,AUDIT]
  --audit-model MODEL
  --audit-all
  --audit-on-completion AUDIT[,AUDIT]
  --code-after-audit
  --triumvirate --secondary-cli CLI --overseer-cli CLI [--exec-cli CLI]
      when --exec-cli is omitted, execution uses the overseer CLI/model.
  --secondary-model MODEL --overseer-model MODEL --exec-model MODEL
  --complexity-tiering        low-complexity features skip the secondary+overseer stages
                              (single planner straight to execution; triumvirate runs only)
  --consistency-gate          overseer validates the plan vs spec.md/assertions.md/feature.json;
                              contradictions abort, smaller gaps are injected into execution
  --model MODEL
  --init-model MODEL
  --code-model MODEL
  --reasoning-effort none|minimal|low|medium|high|xhigh|max
  --thinking | --no-thinking
  --thinking-level low|medium|high
  --simulation
  --director --fleet-summary PATH --director-output PATH
  --director-context PATH
  --suggestion-schema PATH
  --interview [FILE]
  --web [--port N]
  --mcp                      run the MCP server over stdio (requires --web backend running)
  --config-matrix            print effective config defaults without applying override flags
  --filter-by FIELD --filter VALUE
  --milestone VALUE
  --feature VALUE
  --audit-findings [SOURCE]  coding sweep: include approved category-Audit findings in
                             selection (default off), optionally narrowed to one audit SOURCE
  --check-features
  --check-artifacts
  --write-allowlist PATH[,PATH]  revert backend writes outside these relative paths,
                             retry once with the violation in the prompt, then fail (exit 76)
  --worktree                 run execution in an isolated git worktree (branch aidd/run-<id>);
                             merge back on success, discard on failure (free rollback)
  --stop
  --version
`);
}

# External skills

aidd ships only its own skill implementations. Some skills can use an agent-native upstream skill
when one is installed, and otherwise follow their aidd-owned fallback instructions.

The agent makes that choice at runtime. aidd does not detect, install, update, or remove the skills
your agent has installed, and it does not block a workflow because an optional upstream skill is
absent. The local-folder skill import described in [the panel's Skills doc](../../frontend/content/docs/skills.md) is a separate,
user-driven mechanism that copies a package into `data/skills`; it plays no part in resolving the
upstream skills below.

## Optional upstream skills

| Upstream skill                | Author      | Source                                                                                     | Used by                                               | Behavior when unavailable                                                                                                           |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `frontend-design`             | Anthropic   | https://github.com/anthropics/skills/tree/main/skills/frontend-design                      | `ui-redesign-planner`                                 | Uses aidd's design-review rubric                                                                                                    |
| `grill-with-docs`             | Matt Pocock | https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md | `refresh-project-artifacts`, CONTEXT.md maturity item | `refresh-project-artifacts` reviews CONTEXT.md directly and records the unavailable producer; the maturity item stays a manual edit |
| `vercel-react-best-practices` | Vercel Labs | https://github.com/vercel-labs/agent-skills                                                | `audit-review`, `update-audits`                       | Fetches the official source; `audit-review` skips source comparison if unavailable and `update-audits` stops                        |
| `vercel-composition-patterns` | Vercel Labs | https://github.com/vercel-labs/agent-skills                                                | `audit-review`, `update-audits`                       | Fetches the official source; `audit-review` skips source comparison if unavailable and `update-audits` stops                        |
| `web-design-guidelines`       | Vercel Labs | https://github.com/vercel-labs/web-interface-guidelines                                    | `audit-review`, `update-audits`                       | Fetches the official source; `audit-review` skips source comparison if unavailable and `update-audits` stops                        |

`grill-with-docs` depends on upstream `grilling` and `domain-modeling`; follow that project's
installation instructions if you choose to use it.

## Distribution boundary

No upstream skill source is vendored into aidd's skill catalog. Every Git-tracked file under
`skills/` is classified first-party in `licenses/distributed-materials.json`.

Three audit definitions are the exception, and they are audits rather than skills:
`audits/REACT_BEST_PRACTICES.md`, `audits/COMPOSITION_PATTERNS.md`, and
`audits/WEB_DESIGN_GUIDELINES.md` are adapted from MIT-licensed Vercel Labs sources. Each is
recorded as third-party material against a pinned upstream revision, and its notice is rendered
into `THIRD-PARTY-LICENSES.md` and `THIRD-PARTY-NOTICES.md`.

`bun run check:licenses`, which `smoke:qc` runs, enforces the boundary. It enumerates every
Git-tracked file under the catalog roots (`audits`, `skills`, `scaffolding`, `prompts`, `recipes`)
plus the public document surfaces, then fails on any distributed path the registry does not
classify and on any classified path outside that set.

Knip remains an aidd development dependency and `bun run check:dead-code` still runs it. That
package dependency is separate from agent skill distribution.

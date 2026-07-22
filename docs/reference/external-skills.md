# External skills

aidd ships only its own skill implementations. Some skills can use an agent-native upstream skill
when one is installed, and otherwise follow their aidd-owned fallback instructions.

The agent makes that choice at runtime. aidd does not detect, install, update, or remove external
skills, and it does not block a workflow because an optional upstream skill is absent.

## Optional upstream skills

| Upstream skill                | Author      | Source                                                                                     | Used by                         | Behavior when unavailable                                                                                    |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `frontend-design`             | Anthropic   | https://github.com/anthropics/skills/tree/main/skills/frontend-design                      | `ui-redesign-planner`           | Uses aidd's design-review rubric                                                                             |
| `grill-with-docs`             | Matt Pocock | https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md | CONTEXT.md maturity item        | The maturity item remains a manual edit                                                                      |
| `vercel-react-best-practices` | Vercel Labs | https://github.com/vercel-labs/agent-skills                                                | `audit-review`, `update-audits` | Fetches the official source; `audit-review` skips source comparison if unavailable and `update-audits` stops |
| `vercel-composition-patterns` | Vercel Labs | https://github.com/vercel-labs/agent-skills                                                | `audit-review`, `update-audits` | Fetches the official source; `audit-review` skips source comparison if unavailable and `update-audits` stops |
| `web-design-guidelines`       | Vercel Labs | https://github.com/vercel-labs/web-interface-guidelines                                    | `audit-review`, `update-audits` | Fetches the official source; `audit-review` skips source comparison if unavailable and `update-audits` stops |

`grill-with-docs` depends on upstream `grilling` and `domain-modeling`; follow that project's
installation instructions if you choose to use it.

## Distribution boundary

External skill source is not copied into aidd's catalog. The release archive validator compares the
packaged catalog byte-for-byte by path with the Git-tracked aidd catalog and rejects retired vendor
paths or any other extra catalog material.

Knip remains an aidd development dependency and its `knip:*` scripts remain available. That package
dependency is separate from agent skill distribution.

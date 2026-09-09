# Audit ↔ Profile Mapping

This document describes how aidd decides which audits apply to which projects. It covers the
global mapping file, the per-project overrides file, the resolution precedence rules, and the
matrix UI on `/audits`.

## Why an external mapping

Hardcoding applicability in TypeScript constants would have three problems:

1. Operators could not change what runs without editing TypeScript and rebuilding the CLI.
2. An Audits page "Profiles" column aggregated from registered projects would reflect what happens
   to be in the workspace today rather than what the rules say.
3. There would be no way to override applicability for a single project without forking the
   catalog.

The design keeps the decision out of code, in a schema-validated JSON pair, and exposes the result
in the UI as a matrix.

## Files

### Global mapping: `audits/audit-profile-mapping.json`

One file per audit catalog. Schema:

```jsonc
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"version": 1,
	"rules": [
		{
			"id": "archive-prototype-sweep",
			"description": "Prototype/archive projects: skip everything by default.",
			"match": { "bucket": ["prototype_archive"] },
			"effect": "excluded",
			"audits": ["*"],
		},
		{
			"id": "archive-prototype-keep",
			"description": "Prototype/archive minimum audit set.",
			"match": { "bucket": ["prototype_archive"] },
			"effect": "required",
			"audits": ["ASSERTIONS", "DOCUMENTATION", "HYGIENE"],
		},
	],
}
```

`match` is an AND across facets; each facet value is an OR over the listed enum members. The
facet keys mirror `ProjectAssuranceProfile`:

- `bucket` - `ProjectAssuranceBucket[]`
- `criticality` - `ProjectCriticality[]`
- `dataSensitivity` - `ProjectDataSensitivity[]`
- `deployment` - `ProjectDeployment[]`
- `externalIntegrations` - `ProjectExternalIntegrations[]`
- `authMode` - `ProjectAuthMode[]`
- `shipsContainerImage` - `ProjectContainerImage[]`
- `hasCliBinary` - `ProjectCliBinary[]`
- `publishesReleaseArchives` - `ProjectReleaseArtifacts[]`
- `derivesFromTemplate` - `ProjectTemplateOrigin[]`

The last four are carriage facets: they scope a rule by what the project produces rather than by how
exposed it is. A gate about image scanning, binary signing, or template drift is scoped on these.
Before they existed such a gate could only be scoped as a list of repository names, which is the
thing this file exists to replace.

All ten facets are validated, retained during normalization, and evaluated against the project's
profile. For example, `"match": { "shipsContainerImage": ["published"] }` matches only profiles
that publish a container image. Unknown facet keys and invalid enum values fail validation.

`audits` is a list of audit names (upper-snake, matching the `.md` filename) or `["*"]` to mean
"every audit in the catalog".

### Per-project overrides: `<project>/.aidd/audit-profile-overrides.json`

Optional. When present, layered on top of the global mapping:

```jsonc
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"version": 1,
	"audits": {
		"SECURITY": "excluded",
	},
	"rules": [
		{
			"id": "team-skip-lighthouse",
			"match": {},
			"effect": "disabled",
			"audits": ["LIGHTHOUSE"],
		},
	],
	"updatedAt": "2026-05-22T00:00:00.000Z",
}
```

- `audits[name]` pins a single audit to one of `disabled | required | excluded` regardless of
  rules (highest precedence inside the project).
- `rules[]` layers additional rules above the global mapping; same shape as the global file.
- `updatedAt` is stamped automatically by the writer.

## Resolution precedence

When asking "does audit X apply to profile P?", the resolver walks this ladder top-down and
returns the first match:

```
override-explicit (overrides.audits[X])
override-rule    (excluded > required > disabled)
global-rule      (excluded > required > disabled)
default          (applies)
```

Within a single rule layer, the effects rank as `excluded > required > disabled`, **with one
exception**: if a layer has both a wildcard-`excluded` rule that names `["*"]` and a more specific
`required` rule that names the audit explicitly, the explicit `required` wins. This is the only
case where positive intent beats a sweep, and it exists so the common pattern "exclude everything,
then require these three" works without inverting the precedence globally.

`applies` derives from the resolved effect:

| effect     | applies |
| ---------- | ------- |
| `default`  | `true`  |
| `required` | `true`  |
| `disabled` | `false` |
| `excluded` | `false` |

The difference between `disabled` and `excluded` is intent, not behavior:

- `disabled` - "this audit is not useful here, skip it".
- `excluded` - "this audit must never run here, even if a later rule tries to require it".

`excluded` therefore beats `required` at the same layer (except the wildcard case above) so that a
strong "no" cannot be silently overridden by a layered "yes".

## Matrix UI

`/audits` has three tabs:

- **Catalog** - the audit list, with a `Buckets (of 7)` column whose count is a link that switches
  to the Applicability tab.
- **Applicability** - audits × 7 buckets matrix. `default` is most of the grid and renders as a
  muted status dot rather than a badge, so the cells that carry a decision stand out; the other
  three effects render as badges (`required` teal with a dot, `disabled` muted, `excluded`
  outlined with a ring). A trailing `*` marks a conditional cell, and a legend row above the
  matrix spells the vocabulary out. The tooltip surfaces the effect, the rule source
  (`default | global-rule | override-rule | override-explicit`), and the matching `ruleId` if any.
  An "Edit Global Mapping" control opens a JSON editor; it checks that the text parses as JSON,
  then PUTs it, and the server-side schema validation failure comes back as an inline error.
- **Project Overrides** - pick a registered project; the editor exposes (a) per-audit pin
  selectors that write to `overrides.audits[name]` and (b) a JSON textarea for `overrides.rules[]`.
  Saves write `<project>/.aidd/audit-profile-overrides.json`.

### Bucket-cell semantics

Each matrix cell answers the question: "for any plausible profile in this bucket, what is the
strictest rule effect that could apply?" The resolver walks rules whose `match.bucket` permits
the bucket (or has no bucket constraint) and treats other facets as wildcards. If the winning
rule has any non-bucket facets, the cell is marked **conditional** (rendered with an asterisk
and a tooltip note). A conditional `disabled` or `excluded` cell still counts as
`applies = true` in `applicableBucketCount`, because some profiles in the bucket will still
run the audit.

The matrix is a forecast keyed by bucket. The runtime path
(`filterApplicableAuditNames`, director priority, the `audited` maturity stage) uses the project's
actual profile through `resolveAuditEffect`, which evaluates every facet, so the runtime
decision is exact rather than conditional.

### Override file errors are loud

`loadAuditProfileOverrides` distinguishes "no file" from "broken file":

- Missing file → returns `null`, treated as no overrides.
- File exists but JSON parse fails → throws with the file path and parser error.
- File parses but fails schema validation → throws with the file path and the specific
  violation.

The backend `GET /api/v1/audits/project-overrides/:projectId` route catches these as `422`
responses. Audit runner, director, and maturity paths surface the error directly so the
operator is forced to fix the file rather than silently inherit "no overrides."

## File layout

| Path                                                         | Owner           | Purpose                         |
| ------------------------------------------------------------ | --------------- | ------------------------------- |
| `shared/src/contracts/audit-profile-mapping.ts`              | shared contract | Types, schemas, resolver        |
| `shared/src/metadata/audit-profile-mapping.ts`               | CLI/backend     | fs-bound loaders + writers      |
| `audits/audit-profile-mapping.json`                          | operator-edited | Global mapping                  |
| `<project>/.aidd/audit-profile-overrides.json`               | per-project     | Project-scoped overrides        |
| `scripts/aidd-tools.ts` (`audit:profile-mapping` subcommand) | tooling         | Schema + cross-reference linter |

## Validation

`bun run check:audit-profile-mapping` (wired into `smoke:qc`) checks:

- The mapping parses and matches the JSON schema.
- Every `rule.audits[]` entry corresponds to a runnable, non-reference `.md` file in
  `audits/` (except `*`).
- Every `rule.match` facet key is a valid `ProjectAssuranceProfile` field.
- Every facet value array contains only valid enum members.
- No duplicate rule IDs.
- Every runnable, non-reference audit is reachable by at least one probed profile, unless an explicit
  unconditional `disabled` rule makes it opt-in by default (catches accidental sweep rules while
  permitting intentional opt-in audits). The probe is the cross product of every bucket with every
  value of the four carriage facets. A bucket-only sweep would report an audit unreachable purely
  because the single probe profile never shipped an image or published an archive.

Reference documents such as `AUDIT_METHODOLOGY.md` and `SEVERITY_CLASSIFICATION.md` can be copied
alongside selected audits for prompt context, but they are not selectable audit definitions and are
not counted as runnable audits by the validator.

The validator is hosted under `scripts/aidd-tools.ts` as the `audit:profile-mapping` subcommand,
not a free-standing script, to match the existing aidd-tools dispatch pattern.

## Seeded policy

The seeded global mapping (`audits/audit-profile-mapping.json`) carries these baseline rules:

- `archive-prototype-sweep` excludes every audit when `bucket == prototype_archive`.
- `archive-prototype-keep` then requires `ASSERTIONS`, `DOCUMENTATION`, `HYGIENE` (positive
  intent vs the wildcard sweep; see the precedence exception above).
- `ui-parity-default-disabled` disables `UI_PARITY` for every profile until a project explicitly
  marks it `required`.
- `low-exposure-local-skip-infra` disables 9 infra/performance audits (`BUILD_OUTPUT`, `CONVEX`,
  `DATABASE`, `DEPLOYMENT`, `DEVOPS`, `LICENSING`, `LIGHTHOUSE`, `PERFORMANCE`,
  `SCHEMA_CONSTRAINTS`) when the profile is `single_user_local` AND `deployment=local` AND
  `dataSensitivity ∈ {none,low}` AND `externalIntegrations ∈ {none,read_only}` AND
  `criticality ∈ {toy,utility}`.
- `agent-orchestration-local-require` requires `PROXY_AUTH_BOUNDARY`, `OUTBOUND_SSRF`,
  `SECRET_HANDLING_RETENTION`, `AGENT_TOOL_SANDBOX`, `GIT_DESTRUCTIVE_SAFETY`,
  `ORCHESTRATOR_CONCURRENCY`, and `SECURITY` for `single_user_local` profiles whose
  `externalIntegrations ∈ {write_capable,financial_or_security}` - the aidd-shaped case, where
  local deployment hides a real agent attack surface.
- `web-backend-require-proxy-secret` requires `PROXY_AUTH_BOUNDARY`, `OUTBOUND_SSRF`, and
  `SECRET_HANDLING_RETENTION` for every `deployment ∈ {local,lan,private_server,public_server,cloud}`.
- `non-agent-skip-agent-audits` disables `AGENT_TOOL_SANDBOX`, `GIT_DESTRUCTIVE_SAFETY`, and
  `ORCHESTRATOR_CONCURRENCY` for the five buckets above `single_user_local`
  (`multi_user_local`, `private_team`, `internet_single_org`, `public_multi_tenant`,
  `critical_regulated`), which have no agent tool or pipeline to sandbox.

Per-project overrides start absent everywhere and accumulate as operators opt in.

## Related contracts

- [`project-profile.md`](./project-profile.md) for the profile shape and the predicate-style
  helpers (`requiresFullHardening`, `isLowExposureLocalProfile`) that drive director risk-level
  posture but do not affect audit selection.

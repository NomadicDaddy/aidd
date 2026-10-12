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

Beside `rules` the file may carry three optional blocks that test for the thing an audit measures:
`requiresPackages` (audit name to a list of packages), `requiresSurface` (audit name to a surface)
and `surfaces` (surface to the packages that evidence it). They are described under
[For a concrete project](#for-a-concrete-project).

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

### For a concrete project

A profile says how exposed a project is. It does not say what the project is built from, and some
audits can only measure a particular thing: a React audit needs React, a Lighthouse audit needs a
page to load, a schema audit needs a schema. So when the question is "does audit X apply to this
project?", the resolver (`resolveProjectAuditEffect`) continues past the ladder above. The full
order, where the first step that settles the question is final:

1. An explicit per-project override, `overrides.audits[X]`. `required` applies; `disabled` and
   `excluded` do not.
2. A rule in the project's overrides (`excluded` over `required` over `disabled`).
3. A rule in the global mapping, ranked the same way.
4. `requiresPackages`. An audit listed there does not apply unless one of the project's manifests
   declares one of its packages.
5. `requiresSurface`. An audit listed there does not apply unless that surface was detected in the
   project.
6. Otherwise the audit applies.

Steps 1 to 3 are the ladder above. Whatever effect they produce stands on its own, so steps 4 and 5
are reached only by an audit nothing has ruled on. That is what makes the overrides file the escape
hatch in both directions:

- Detection says a surface is absent and it is wrong (a project that talks to a database through a
  built-in driver, a frontend in a language no manifest describes): mark the audit `required`.
- Detection says a surface is present and the audit still has nothing to measure (a page that
  nothing serves, a terminal interface built with React): mark the audit `excluded` or `disabled`.

A cell that step 4 or 5 decided carries `effect: disabled`, a `source` of `missing-package` or
`missing-surface`, and a `reason` in words, for example `requires a web frontend; none detected`.
The Profile tab's audit preview returns that `reason` with each audit it applies to.

### Surfaces

There are two surfaces, `web-frontend` and `database`. The mapping's `surfaces` block names the
packages that evidence each, and `requiresSurface` names the audits that need one:

```jsonc
{
	"requiresSurface": {
		"DATABASE": "database",
		"FRONTEND": "web-frontend",
		"LIGHTHOUSE": "web-frontend",
		"SCHEMA_CONSTRAINTS": "database",
		"WEB_DESIGN_GUIDELINES": "web-frontend",
	},
	"surfaces": {
		"database": { "packages": ["drizzle-orm", "pg", "prisma"] },
		"web-frontend": { "packages": ["react", "vite", "astro"] },
	},
}
```

A surface is present when either kind of evidence is found, and the detector
(`shared/src/metadata/project-surfaces.ts`) records which one decided it:

- **A declared package.** Any package in the surface's list, in the root manifest, a declared
  workspace, or a `package.json` up to two directories down. These are the same manifests
  `requiresPackages` reads. Evidence reads `declares react in frontend/package.json`.
- **A file in the project's tree.** For `web-frontend`, markup source: an `.html`, `.astro`, `.vue`,
  `.svelte`, `.tsx` or `.jsx` file. For `database`, something the project owns: a `schema.prisma`
  file, a database file (`.db`, `.sqlite`, `.sqlite3`), or a `.sql` script. A project can keep its
  database with no driver package at all and its SQL outside any directory named for migrations,
  so neither is required. Evidence reads `index.html under public/`.

The file scan runs only for a surface no manifest settled. It is breadth-first from the project
root with no depth limit, reads at most 5,000 directory entries, and never enters `node_modules`,
`vendor`, `dist`, `build`, `out`, `coverage`, `test`, `tests`, `__tests__`, `fixtures`, `docs`,
`examples`, `scripts`, `config`, or any directory whose name starts with a dot.

Only a scan that finished can say a surface is absent. One that reached its entry limit, or met a
directory it could not read, has ruled nothing out: each surface it was still looking for counts
as present, with evidence such as `file scan incomplete: it stopped at its limit of 5000 entries`
or `file scan incomplete: backend/ could not be read`. An audit that runs and finds nothing costs
a session; one withheld on an unfinished search is silently never run. So adding unrelated files,
moving source deeper or losing access to part of a tree can add an audit and can never remove one.

Known limits, all handled by a per-project override:

- Markup counts whether or not anything serves it. A static site's `index.html` and a desktop
  renderer's page both count, and so does a page that is only opened by hand.
- An import of `bun:sqlite` or another built-in driver is not evidence of a database. A tool may
  open another program's database read-only and own no schema.
- Only `package.json` manifests are read. A project in another ecosystem is detected by its files
  alone.

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

The matrix is a forecast keyed by bucket. It knows nothing about any one project, so it never shows
a package or surface requirement. The runtime path (`filterApplicableAuditNames`, director
priority, the `audited` maturity stage, the per-project audit list and the Profile tab's preview)
uses the project's actual profile and tree through `resolveProjectAuditEffect`, which evaluates
every facet and then the project's packages and surfaces, so the runtime decision is exact rather
than conditional. Every one of those readers gets the project's evidence from
`readProjectAuditEvidence`, so they cannot disagree about what a project is built from.

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
| `shared/src/metadata/project-surfaces.ts`                    | CLI/backend     | Surface detector, evidence read |
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
- Every `requiresPackages` list names at least one package. Every `surfaces` key is a known surface
  with at least one package, and every `requiresSurface` value is a surface that `surfaces` defines.
- Every audit named in `requiresPackages` or `requiresSurface` is a runnable audit.
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
- `local-write-capable-require-security` requires `PROXY_AUTH_BOUNDARY`, `OUTBOUND_SSRF`,
  `SECRET_HANDLING_RETENTION`, and `SECURITY` for `single_user_local` profiles whose
  `externalIntegrations ∈ {write_capable,financial_or_security}`: local deployment does not shrink
  the surface of a tool that writes to other systems.
- `live-require-proxy-secret` requires `PROXY_AUTH_BOUNDARY`, `OUTBOUND_SSRF`, and
  `SECRET_HANDLING_RETENTION` for every bucket except `prototype_archive`. An archive is left out
  on purpose: a `required` rule that names an audit beats the archive sweep's wildcard, so matching
  archives here would undo the sweep for these three.
- `agent-audits-opt-in` disables `AGENT_TOOL_SANDBOX`, `GIT_DESTRUCTIVE_SAFETY`, and
  `ORCHESTRATOR_CONCURRENCY` for every profile. They examine tools that run coding agents, shells or
  git against repositories, which no profile facet records, so each such project marks them
  `required` in its overrides (aidd, aidd-beta-harness and summon do). Bucket and integrations were
  a poor proxy: they gave these audits to local CLIs and games and denied them to a multi-user agent
  tool. The opt-in is only as durable as the overrides file: a repository that ignores `.aidd/`
  (aidd itself does) keeps it per checkout, so a fresh clone runs no agent audits until its
  operator opts in again. Nothing infers agent use automatically.
- `distributes-require-licensing-*` (three rules) require `LICENSING` for a live project that
  publishes binary release archives, publishes a container image, or ships a packaged CLI binary,
  whatever its exposure: distributing a build carries its dependencies' license obligations.

`requiresPackages` gates an audit on the project's declared dependencies after the rules: an audit
listed there applies only where some manifest depends on one of its packages, unless a rule or
override made it `required`. `COMPOSITION_PATTERNS`, `REACT_BEST_PRACTICES` and `SSOC` need `react`;
`MOBILE` needs `expo` or `react-native`; `CONVEX` needs `convex`; `AI` needs an LLM SDK (`openai`,
`@anthropic-ai/sdk`, `ai`, `ollama` and the like). A project that calls a provider over plain HTTP
has no such package, so it marks `AI` `required` in its overrides (aidd and TalkWithMe do).

`requiresSurface` gates an audit on what the project's tree holds, in the same position and with
the same exception: `LIGHTHOUSE`, `FRONTEND` and `WEB_DESIGN_GUIDELINES` need a `web-frontend`;
`DATABASE` and `SCHEMA_CONSTRAINTS` need a `database`. A command-line tool or an engine library
with no page and no schema is not given audits that could only report that they had nothing to
measure. See [Surfaces](#surfaces) for what counts as evidence.

Per-project overrides start absent everywhere and accumulate as operators opt in.

## Related contracts

- [`project-profile.md`](./project-profile.md) for the profile shape and the predicate-style
  helpers (`requiresFullHardening`, `isLowExposureLocalProfile`) that drive director risk-level
  posture but do not affect audit selection.

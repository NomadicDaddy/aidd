# Project Profile

Project profiles describe how much assurance a target application needs. aidd reads them from:

```text
.aidd/project-profile.json
```

When this file exists and validates, aidd treats the profile as explicit. When it is missing or
invalid, `readProjectAssuranceProfile()` falls back to inference from project signals such as
`package.json`, stack metadata, dependencies, and archive-style paths.

## Canonical File

```json
{
	"authMode": "rbac",
	"bucket": "multi_user_local",
	"criticality": "utility",
	"dataSensitivity": "personal",
	"deployment": "local",
	"derivesFromTemplate": "none",
	"externalIntegrations": "none",
	"hasCliBinary": "none",
	"notes": "Optional context for why this profile was chosen.",
	"publishesReleaseArchives": "none",
	"shipsContainerImage": "local_only",
	"source": "explicit",
	"updatedAt": "2026-05-19T00:00:00.000Z"
}
```

The web project Profile UI writes this canonical shape. `source` is always `explicit` for the file
contract, and `updatedAt` is an ISO timestamp from the write operation. Files without `source` or
`updatedAt` are invalid and are treated the same as a missing explicit profile.

`notes` is optional. It is trimmed, capped at 4000 characters, and omitted when empty.

## Fields

All ten core fields are required enums, in two groups.

The **six exposure facets** (`bucket`, `dataSensitivity`, `deployment`, `authMode`, `criticality`,
`externalIntegrations`) say how exposed the project is, and therefore how hard the gates that apply
to it should press. Within each, values are listed from lowest to highest assurance, the same order
they appear in the Profile UI dropdowns. Values marked **⊕ full hardening** satisfy a clause of
`requiresFullHardening()`; values marked **⊖ low-exposure** are the only ones permitted by
`isLowExposureLocalProfile()` (see [Operational Effect](#operational-effect)).

The **four carriage facets** (`shipsContainerImage`, `hasCliBinary`, `publishesReleaseArchives`,
`derivesFromTemplate`) say what the project produces and where that output goes, and therefore which
gates apply to it at all. No value of any of them moves the posture predicates, so none carries a ⊕
or ⊖ marker: a project that ships nothing is not thereby safer, the gate simply has nothing to
inspect.

The **UI label** column matches the short text shown in the web Profile tab and project list badges.

### `bucket`: overall exposure and operating model

| Value                 | UI label          | Meaning                                                                                                                        |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `prototype_archive`   | Archive           | Throwaway, retired, or snapshot code not run in anger. Inferred automatically for `.old` directories and `/archive` paths.     |
| `single_user_local`   | Single-user local | One person runs it on their own machine; no other users. ⊖ low-exposure. Inferred default for non-Spernakit local tools.       |
| `multi_user_local`    | Multi-user local  | Multiple users, but still on a local/trusted network (e.g. a household or workshop). Inferred default for full Spernakit apps. |
| `private_team`        | Private team      | Used by a defined internal team, typically behind a private server and not exposed to the public internet.                     |
| `internet_single_org` | Internet org      | Internet-reachable but serving a single organization's users. Inferred for `react+convex` / cloud stacks.                      |
| `public_multi_tenant` | Multi-tenant      | Public SaaS serving many independent tenants or customers. ⊕ full hardening.                                                   |
| `critical_regulated`  | Critical          | Mission-critical and/or operating under regulatory obligations. Highest assurance tier. ⊕ full hardening.                      |

### `dataSensitivity`: highest expected sensitivity of app data

| Value          | UI label     | Meaning                                                                           |
| -------------- | ------------ | --------------------------------------------------------------------------------- |
| `none`         | None         | No meaningful data to protect. ⊖ low-exposure.                                    |
| `low`          | Low          | Trivial or non-identifying data; leakage is inconsequential. ⊖ low-exposure.      |
| `personal`     | Personal     | Personal data tied to individuals (PII): names, emails, personal notes.           |
| `confidential` | Confidential | Sensitive business or secret data whose disclosure would cause real harm.         |
| `regulated`    | Regulated    | Data under a legal/compliance regime (health, financial, etc.). ⊕ full hardening. |

### `deployment`: where the app is expected to run

| Value            | UI label       | Meaning                                                                     |
| ---------------- | -------------- | --------------------------------------------------------------------------- |
| `local`          | Local          | Runs only on the developer/owner's own machine. ⊖ low-exposure.             |
| `lan`            | LAN            | Runs on a local/private network (home or office LAN); not internet-exposed. |
| `private_server` | Private server | Hosted on a server but restricted to a private/internal audience.           |
| `public_server`  | Public server  | Hosted on an internet-reachable server. ⊕ full hardening.                   |
| `cloud`          | Cloud          | Runs on managed/public cloud infrastructure. ⊕ full hardening.              |

### `authMode`: ownership, login, and authorization boundary

| Value         | UI label    | Meaning                                                                                     |
| ------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `none`        | None        | No authentication; anyone with access can use the app.                                      |
| `local_owner` | Local owner | A single implicit owner (the local OS user); no login screen, identity is the machine user. |
| `login`       | Login       | Authenticated users sign in, but all authenticated users are equal (no role distinctions).  |
| `rbac`        | RBAC        | Role-based access control; permissions vary by assigned role.                               |
| `tenant_rbac` | Tenant RBAC | Role-based access scoped per tenant; combines tenant isolation with roles.                  |

### `criticality`: impact if the app is unavailable, wrong, or unsafe

| Value               | UI label          | Meaning                                                                         |
| ------------------- | ----------------- | ------------------------------------------------------------------------------- |
| `toy`               | Toy               | Experiment or demo; failure has no consequence. ⊖ low-exposure.                 |
| `utility`           | Utility           | Helpful tool; failure is an easily worked-around inconvenience. ⊖ low-exposure. |
| `operational`       | Operational       | Supports day-to-day operations; failure disrupts real work.                     |
| `business_critical` | Business critical | Core to the business; failure causes significant harm. ⊕ full hardening.        |

### `externalIntegrations`: risk level of outbound systems the app can read from or modify

| Value                   | UI label           | Meaning                                                                                                        |
| ----------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `none`                  | None               | No external/outbound integrations. ⊖ low-exposure.                                                             |
| `read_only`             | Read-only          | Reads from external systems but cannot modify them. ⊖ low-exposure.                                            |
| `write_capable`         | Write-capable      | Can write to or modify external systems.                                                                       |
| `financial_or_security` | Financial/security | Integrates with financial or security-sensitive systems (payments, auth providers, secrets). ⊕ full hardening. |

### `shipsContainerImage`: whether a container image is built, and whether it reaches a registry

| Value        | UI label        | Meaning                                                                                           |
| ------------ | --------------- | ------------------------------------------------------------------------------------------------- |
| `none`       | None            | No container image is built.                                                                      |
| `local_only` | Local only      | A `Dockerfile` exists and images are built locally or in CI, but nothing is pushed to a registry. |
| `published`  | Published image | Images are pushed to a registry (ghcr, Docker Hub, a private registry) and consumed from there.   |

### `hasCliBinary`: whether the project is invoked as a command, and whether it ships a compiled artifact

| Value             | UI label        | Meaning                                                                                     |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------- |
| `none`            | None            | Not invoked as a command-line program.                                                      |
| `script_entry`    | Script entry    | Exposes a command that runs from source: a `bin` entry, or a script invoked directly.       |
| `packaged_binary` | Packaged binary | Compiles to a standalone executable that runs without the source tree or a package manager. |

### `publishesReleaseArchives`: what a published release carries

| Value             | UI label        | Meaning                                                                                               |
| ----------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| `none`            | None            | No releases are published.                                                                            |
| `source_only`     | Source only     | Releases are published, but carry only what the forge attaches automatically plus notes.              |
| `binary_archives` | Binary archives | Releases carry built artifacts uploaded by the release job: archives, installers, checksum manifests. |

### `derivesFromTemplate`: which template the project was scaffolded from

| Value       | UI label  | Meaning                                                                   |
| ----------- | --------- | ------------------------------------------------------------------------- |
| `none`      | None      | Not scaffolded from a fleet template.                                     |
| `spernakit` | Spernakit | Scaffolded from the Spernakit template and subject to its drift contract. |

This one names the template rather than answering yes or no, so a second template can be added
without changing the type of anything that already reads the facet.

### Inference defaults

When no valid explicit file is present, `inferProjectAssuranceProfile()` picks one of four preset
profiles from project signals (first match wins):

| Signal                                       | bucket                | authMode      | criticality   | dataSensitivity | deployment | externalIntegrations |
| -------------------------------------------- | --------------------- | ------------- | ------------- | --------------- | ---------- | -------------------- |
| `.old` directory or `/archive` path          | `prototype_archive`   | `none`        | `toy`         | `none`          | `local`    | `none`               |
| `convex` dependency or `react+convex` stack  | `internet_single_org` | `login`       | `operational` | `personal`      | `cloud`    | `write_capable`      |
| Spernakit stack (excluding `spernakit-lite`) | `multi_user_local`    | `rbac`        | `utility`     | `personal`      | `local`    | `none`               |
| Fallback (anything else)                     | `single_user_local`   | `local_owner` | `utility`     | `low`           | `local`    | `none`               |

The four carriage facets are not part of these presets. They are read from the filesystem
independently and merged into whichever preset matched:

| Facet                      | Inferred from                                                  | Ceiling                                                                 |
| -------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `shipsContainerImage`      | A `Dockerfile` at the project root.                            | `local_only`; `published` is never inferred.                            |
| `hasCliBinary`             | A `bin` entry, or a `package.json` script running `--compile`. | `packaged_binary` is inferred when a script compiles.                   |
| `publishesReleaseArchives` | Nothing.                                                       | Always `none`.                                                          |
| `derivesFromTemplate`      | A `spernakit_version` key in `package.json`.                   | `spernakit` when the key is present; the template itself infers `none`. |

Two of the four have a top rung inference deliberately never reaches. A registry push and an
uploaded release archive both live in CI workflow YAML, and reading that here would mean parsing
every forge's syntax to answer a question the explicit profile answers directly. Inference stops at
the rung it can prove, which under-claims rather than over-claims: a gate scoped to `published` is
withheld from a project nobody profiled, instead of applied to one that turns out not to publish.

Inferred profiles carry `source: "inferred"`; writing through the Profile UI promotes the profile to
`source: "explicit"` and persists the canonical file.

## Validation Contract

The shared schema and runtime normalizer live in:

```text
shared/src/contracts/project-profile.ts
```

This module exports:

- `projectAssuranceProfileInputSchema` for web/API write input.
- `projectAssuranceProfileFileSchema` for canonical `.aidd/project-profile.json` files.
- `normalizeProjectAssuranceProfileInput()` for UI/API writes.
- `normalizeProjectAssuranceProfileFile()` for explicit file reads.

The CLI and backend use these shared helpers so enum values, notes handling, and canonical output
stay aligned. The backend `PUT /api/v1/projects/:id/profile` route builds its TypeBox request body
from the same shared enum arrays.

## Operational Effect

Profiles drive two distinct downstream behaviors:

1. **Audit applicability** is governed by an external mapping file pair, not by code: the global
   `audits/audit-profile-mapping.json` and per-project `<project>/.aidd/audit-profile-overrides.json`
   together resolve each `(profile, audit)` pair to one of `default | disabled | required |
excluded`. The resolver is shared between `filterApplicableAuditNames`, the director's audit
   discovery, and Stage 6 maturity. See [`audit-applicability.md`](./audit-applicability.md) for
   the file format, precedence ladder, and matrix UI.
2. **Risk-level posture** is still expressed as code-side predicates against the profile shape:
   `requiresFullHardening(profile)` (public, regulated, cloud-deployed, financially/security-
   integrated, or business-critical) and `isLowExposureLocalProfile(profile)` (small local tools).
   These are consumed by `directorPriority` to bias suggestion severity; they describe profile
   semantics rather than audit selection and are defined in
   `shared/src/contracts/audit-profile-mapping-resolve.ts` (re-exported through
   `shared/src/metadata/project-profile.ts`).
    - `requiresFullHardening(profile)` returns `true` when **any** of: `bucket` is
      `public_multi_tenant` or `critical_regulated`; `dataSensitivity` is `regulated`; `deployment`
      is `public_server` or `cloud`; `externalIntegrations` is `financial_or_security`; or
      `criticality` is `business_critical`.
    - `isLowExposureLocalProfile(profile)` returns `true` only when **all** of: `bucket` is
      `single_user_local`; `deployment` is `local`; `dataSensitivity` is `none` or `low`;
      `externalIntegrations` is `none` or `read_only`; and `criticality` is `toy` or `utility`.
    - Neither predicate reads a carriage facet. Those scope applicability through the mapping file in
      (1), where a rule may match on them exactly as it matches on `bucket`.

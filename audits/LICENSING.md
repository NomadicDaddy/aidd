---
title: 'Third-Party Software Licensing Audit'
last_updated: '2026-10-01'
version: '2.1'
category: 'Compliance'
priority: 'High'
estimated_time: '3-6 hours'
frequency: 'Quarterly and before each release'
lifecycle: 'pre-release'
---

# Third-Party Software Licensing Audit

> **Severity reference:** See
> [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
>
> **Methodology gate:** Follow [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md). Read the
> enforcing implementation, cite `file:line`, falsify every "by design" or "N/A" rationale,
> and never score a control from a green gate alone. A "not distributed" or "no such component"
> conclusion is an absence claim and needs a known-positive control (Rule 5).

This audit determines what third-party material a project actually distributes and whether each
distributed artifact carries the notices, permissions, source, and relink materials its licenses
require. It also checks that the project states its own license consistently. Package metadata is
supporting evidence; the final artifact is the primary evidence.

Citations in this audit name a script, symbol, or file, not a line. Locate each one in the live
target, then cite the `file:line` you actually read in the report. A named script or symbol that
does not exist in the target is resolved before scoring: decide whether it moved, was removed, or
never applied to this kind of target, and record which.

This is an engineering compliance review, not legal advice. Escalate novel license combinations,
custom terms, and disputed derivative-work questions for qualified legal review.

## Executive Summary

### Critical priorities

- **Inventory every distribution surface.** Inspect release archives, executables, browser assets,
  container images, registry packages, source archives, and runtime-downloaded components.
- **Resolve every distributed component.** A missing metadata field is a review trigger. An actual
  absence of a license grant is a blocker.
- **Inspect the final artifact.** Repository notices and passing generators do not prove that users
  receive those notices.
- **Meet copyleft source and relink obligations.** Verify that corresponding source and relink
  materials are exact, available, and retained for the required period.
- **Review existing public artifacts.** A fix on the current branch does not repair binaries that
  remain downloadable from older releases.

### Essential standards

- The project's own license and real distribution posture are documented, and the `LICENSE` file
  and every package manifest's `license` field say the same thing.
- The project's own choice of license is not a finding. Proprietary (`UNLICENSED`, all rights
  reserved) and source-available (for example `FSL-1.1-ALv2`) are valid choices.
- Every shipped component is identified by name, version, source, license, and inclusion path.
- Build-only tools are separated from code or assets that enter a distributed artifact.
- SPDX expressions are interpreted, not flattened to a convenient single label.
- Required license texts, copyright notices, and upstream `NOTICE` content reach recipients.
- Every written source offer is valid for the applicable license and operationally fulfillable.
- Every "not distributed," "build-only," or "N/A" conclusion has artifact evidence.
- Automated checks fail closed when their expected artifact does not exist.

## Table of Contents

1. [License Classification Reference](#license-classification-reference)
2. [Pre-Audit Setup](#pre-audit-setup)
3. [Distribution Artifact Inventory](#1-distribution-artifact-inventory)
4. [Component and License Inventory](#2-component-and-license-inventory)
5. [Artifact Inclusion and Coupling](#3-artifact-inclusion-and-coupling)
6. [License Compatibility](#4-license-compatibility)
7. [Attribution and Notice Compliance](#5-attribution-and-notice-compliance)
8. [Copyleft Source and Relink Compliance](#6-copyleft-source-and-relink-compliance)
9. [Historical and Public Distribution](#7-historical-and-public-distribution)
10. [Continuous Compliance and Drift](#8-continuous-compliance-and-drift)
11. [aidd and Spernakit Applicability](#aidd-and-spernakit-applicability)
12. [Audit Checklist](#audit-checklist)
13. [Report Template](#report-template)
14. [Deliverables](#deliverables)
15. [Success Criteria](#success-criteria)

## License Classification Reference

Classification is a starting point, not a verdict. Obligations depend on the covered material,
how it is combined, whether it is modified, and how it is distributed.

### Permissive licenses

| SPDX identifier | Typical distribution obligations                                                  |
| --------------- | --------------------------------------------------------------------------------- |
| `MIT`           | Preserve the copyright and permission notice in copies or substantial portions    |
| `Apache-2.0`    | Include the license; preserve applicable notices and modification notices         |
| `BSD-2-Clause`  | Preserve the copyright, conditions, and disclaimer                                |
| `BSD-3-Clause`  | Preserve BSD notices and comply with the non-endorsement clause                   |
| `ISC`           | Preserve the copyright and permission notice                                      |
| `0BSD`          | No attribution condition, but retain provenance in the inventory                  |
| `Zlib`          | Preserve the notice; do not misrepresent origin or modified versions              |
| `BlueOak-1.0.0` | Preserve notices and license terms as applicable                                  |
| `CC0-1.0`       | Public-domain dedication with fallback permissions; retain provenance             |
| `OFL-1.1`       | Keep the license with fonts; respect reserved names and font redistribution terms |

For Apache-2.0, preserve upstream `NOTICE` content only when a distributed component supplies
applicable `NOTICE` material. Do not invent a `NOTICE` requirement where none exists.

### Weak copyleft licenses

Weak copyleft does not automatically relicense the whole application, but using an unmodified
component does not eliminate distribution obligations.

| SPDX identifier         | Questions the audit must answer                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `LGPL-2.0` / `LGPL-2.1` | Is it statically or dynamically linked? Can recipients replace and relink it? Is exact source available?   |
| `LGPL-3.0`              | Are Minimal Corresponding Source and suitable Application Code provided under GPLv3 conveyance rules?      |
| `MPL-2.0`               | Are covered files distributed, modified, or compiled into distributed form? Is Source Code Form available? |
| `EPL-2.0`               | Is a derivative or modified EPL component distributed, and are source obligations met?                     |
| `CDDL-1.0`              | Which covered files are distributed or modified, and is required source available?                         |

An npm import, native addon, static binary, browser bundle, and operating-system package are not
equivalent forms of use. Record the actual coupling and distribution model before deciding risk.

### Strong copyleft and network copyleft

| SPDX identifier                       | Primary review question                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GPL-2.0-only` / `GPL-2.0-or-later`   | Is the component part of a combined work or merely aggregated, and how will corresponding source be delivered? |
| `GPL-3.0-only` / `GPL-3.0-or-later`   | How will corresponding source and any required installation information be provided?                           |
| `AGPL-3.0-only` / `AGPL-3.0-or-later` | Is a modified covered program used for remote network interaction, or is covered code conveyed to users?       |

Do not describe these licenses as "viral." Do not treat the presence of a GPL program in a
container as proof that unrelated application code becomes GPL. Assess linking, derivation, and
mere aggregation separately.

### Source-available and restrictive licenses

These terms are not open-source licenses and require individual review when they cover a
**third-party component** the project distributes. The same terms on the **project's own** code are
the owner's choice, not a finding; see Step 0.

| License family                      | Typical concern                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| SSPL                                | Service-side conditions extend beyond ordinary open-source copyleft                                                      |
| BSL / BUSL                          | Use restrictions apply until the stated change date                                                                      |
| FSL (`FSL-1.1-ALv2`, `FSL-1.1-MIT`) | Competing use is restricted until each version converts to the named future license two years after it is made available |
| Elastic License 2.0                 | Managed-service and circumvention restrictions                                                                           |
| Commons Clause                      | Selling or commercial-hosting restrictions layered onto another license                                                  |
| CC-BY-NC                            | Commercial use prohibited                                                                                                |
| Proprietary or custom               | Rights depend entirely on the supplied terms or commercial agreement                                                     |
| `SEE LICENSE IN <file>`             | Read the referenced file; package metadata alone is not the license                                                      |

### Unknown and missing information

| Observation                          | Required action                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Missing `package.json` license field | Inspect packaged license files and exact-version upstream source                                                   |
| Non-SPDX or ambiguous string         | Read the actual terms and normalize only after manual review                                                       |
| `UNLICENSED` on a dependency         | Determine whether it is a private-package marker or genuinely lacks a grant                                        |
| `UNLICENSED` on the project itself   | Not a defect. It is the manifest value for "no license granted"; confirm the `LICENSE` file says the same (Step 0) |
| No packaged license file             | Check registry provenance and the exact tagged source release                                                      |
| No license grant found after review  | Block distribution, replace the component, or obtain permission                                                    |

## Pre-Audit Setup

### Step 0: Establish the project's own license

Read the root `LICENSE` or equivalent legal file first. Treat a package manifest's `license` field
as metadata that must agree with it. `private: true` prevents accidental registry publication;
it does not make a project proprietary and it is not sticky licensing metadata for derived work.

**The owner's choice of license is not a finding.** Do not report any of these as a defect:

- `"license": "UNLICENSED"` with an all-rights-reserved `LICENSE` file. `UNLICENSED` is the
  manifest value for "no license is granted". It is not the same as a missing field, and it is not
  the public-domain `Unlicense`.
- A source-available license on the project's own code. `FSL-1.1-ALv2` is a valid SPDX identifier.
- A license that differs from the license of the template, framework, or starter the project was
  created from. A derived application is not obliged to carry its template's license on its own
  code. It is obliged to keep the template's notice for the template material it copied, which is
  a third-party notice question (Section 5), not the project's own license.

**What is a finding** is disagreement or absence:

| Observation                                                                                           | Disposition                                                          |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `LICENSE` file and the root manifest `license` field name different terms                             | Finding. Quote both. The owner decides which is right                |
| A workspace manifest declares a license that conflicts with the root                                  | Finding                                                              |
| The manifest `license` value is not a valid SPDX expression, `UNLICENSED`, or `SEE LICENSE IN <file>` | Finding                                                              |
| No `LICENSE` file and no manifest `license` field, in a project that is distributed                   | Finding. Recipients have no stated terms                             |
| README, documentation, or an in-app notice names a different license from `LICENSE`                   | Finding                                                              |
| The `LICENSE` file is another project's text, unchanged, that the owner did not choose                | Finding to raise with the owner. See "Inherited license files" below |
| A workspace manifest has no `license` field while the root has one, in a private monorepo             | Not a finding by itself. Record it                                   |

**Inherited license files.** A project created by copying a template can carry the template's
`LICENSE` without anyone having chosen it. Compare the file with the template's and check who the
copyright line names. An inherited file is raised with the owner as a decision to make. The audit
does not rewrite a `LICENSE` file, change a `license` field, or pick a license: that is a legal
decision, and for already-published versions a changed file does not withdraw a grant recipients
received. See [Spernakit and derived applications](#spernakit-and-derived-applications) for the
template-specific case.

Record:

- Current project license and version-specific future-license terms, if any
- Whether source is public, private, internal, or source-available
- Whether third-party terms conflict with restrictions in the project's own license
- Whether recipients may modify the application for their own use and reverse-engineer it for
  debugging modifications when an LGPL component requires those permissions

### Step 1: Enumerate distribution surfaces

Do not infer distribution from `package.json`. Examine repository workflows, release scripts,
container scripts, documentation, and public registries.

| Distribution surface  | Evidence to collect                                                      |
| --------------------- | ------------------------------------------------------------------------ |
| Release archive       | Packaging script, workflow, final ZIP/tar contents, checksum             |
| Standalone executable | Compiler target, embedded runtime, bundle entry points, sibling assets   |
| Browser application   | Production JS/CSS/font assets delivered to browsers                      |
| Container image       | Base image, OS packages, copied files, global packages, image digest     |
| Package registry      | Exact published tarball and registry visibility                          |
| Source distribution   | Included vendored files, generated sources, submodules, patches          |
| Runtime download      | Installer/entrypoint behavior, target license, who performs the download |

For every omitted surface, write a falsification record. For example, a claim that an image is
"local proof only" requires checks of container registries, push workflows, documentation, and
release automation.

### Step 2: Prefer repository-native checks

Run existing checks before introducing a generic scanner. Read their implementation and prove they
cover the expected artifact. A check that exits successfully because its input directory is absent
is not evidence.

Read the target's `package.json` scripts and use the ones it has. Script names differ by target,
and a name listed in this audit that the target lacks is not a finding by itself: establish
whether the target has the distribution surface that script would check. Examples seen in Bun
repositories:

```text
bun run check:licenses
bun run check:image-licenses
bun run check:image-publication
bun pm ls --all
```

Run only checks that read. A script that regenerates inventory files, builds or pushes an image,
packages a release, or syncs files into other repositories changes state: read its source
instead, and do not run it as part of a read-only audit. Do not assume an unknown flag such as
`--help` is safe; read the script's argument handling first.

Then use a generic scanner as a cross-check when needed:

```text
bunx license-checker-rseidelsohn --json
```

Do not install a new dependency merely to execute a read-only audit. Do not use a fixed permissive
allowlist as a substitute for classifying weak copyleft, multi-license expressions, custom terms,
or artifact inclusion.

## 1. Distribution Artifact Inventory

Build or obtain every artifact users can receive. Inspect the artifact itself, not only the source
tree or staging directory.

| Check | Criterion                                                                                 |
| ----- | ----------------------------------------------------------------------------------------- |
| `[ ]` | Every release/package/container surface is listed with visibility and distribution intent |
| `[ ]` | Final archives are extracted and their actual contents recorded                           |
| `[ ]` | Executables are mapped to their compiler/runtime and bundle entry points                  |
| `[ ]` | Browser assets are treated as distributed copies even when the server is SaaS             |
| `[ ]` | Container images are inspected from their immutable digest or exact local image ID        |
| `[ ]` | Runtime-installed tools are distinguished from tools baked into the artifact              |
| `[ ]` | "Not distributed" claims include registry and workflow evidence                           |

### Distribution model guidance

| Model                                | Licensing consequence                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-only SaaS code                | Ordinary GPL conveyance is generally not triggered if users receive no copy; AGPL network terms may still apply                             |
| Browser frontend                     | JS, CSS, fonts, and other client assets are conveyed to users and must be audited                                                           |
| Internal use within one legal entity | Usually no external conveyance; still assess AGPL remote-network use and contractor/affiliate transfers                                     |
| Standalone executable                | Bundled and embedded components are distributed with the executable                                                                         |
| Container image                      | Application files, runtimes, OS packages, and baked-in tools are distributed together, often by aggregation                                 |
| Library or registry package          | The exact published tarball is the artifact of record                                                                                       |
| Source repository/template           | Source and vendored material are distributed; downstream users own obligations for artifacts they create unless the template publishes them |

## 2. Component and License Inventory

### Inventory scopes

Maintain separate scopes instead of treating every installed package as shipped.

| Scope                           | Required treatment                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| Distributed runtime closure     | Full license and notice review                                                              |
| Browser production closure      | Full review of bundled code, fonts, icons, and copied assets                                |
| Embedded runtime/native closure | Full review, including licenses not represented in the package lockfile                     |
| Container base-system closure   | Inventory installed binary and source package names, versions, licenses, and notices        |
| Build-only tools                | Confirm they do not contribute covered code; record special output or code-generation terms |
| Test/development-only tools     | Lower priority unless redistributed, vendored, patched, or used to generate covered output  |

### Workspace and provenance checks

| Check | Criterion                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------- |
| `[ ]` | Root and every actual workspace are enumerated from the live workspace configuration           |
| `[ ]` | Direct, transitive, optional, peer, native, and platform-specific dependencies are handled     |
| `[ ]` | Lockfile versions match the installed graph and generated inventory                            |
| `[ ]` | Vendored code, copied executables, fonts, icons, templates, and generated code are inventoried |
| `[ ]` | Package metadata is cross-checked against packaged license and `NOTICE` files                  |
| `[ ]` | Tenable SPDX expressions (`OR`, `AND`, `WITH`) are preserved and interpreted correctly         |

For an `OR` expression, select a license only after confirming the distributor is allowed to make
that choice and that the selected terms fit the artifact. Do not automatically label one branch
"most permissive." For `AND`, comply with all applicable terms. For `WITH`, apply the named
exception to the stated base license.

## 3. Artifact Inclusion and Coupling

For every potentially significant component, record how it reaches the artifact.

1. **Imported and bundled:** source is incorporated into an application or browser bundle.
2. **Statically linked:** library code is incorporated into an executable.
3. **Dynamically linked:** executable loads a separate library at runtime.
4. **Separate executable:** application invokes another program through a process boundary.
5. **Mere aggregation:** independent works are distributed on the same medium or in one image.
6. **Build-only:** tool processes input but its covered code is not copied into output.
7. **Runtime-installed:** recipient-side startup behavior downloads a component after distribution.

### Bun standalone executables

This subsection applies only to a target that distributes a compiled executable. Confirm that
first from the build scripts, release workflow, and published release assets. A target distributed
as source does not convey the Bun runtime, and these checks are N/A for it with that evidence.

`bun build --compile` embeds the Bun runtime and bundles code reachable through the selected entry
point. It does not prove that every installed package is embedded, and an npm-only scan does not
inventory Bun's own linked libraries. The audit must:

- Read the exact Bun license for the compiler/runtime version
- Identify Bun's statically linked LGPL and permissive components
- Trace the standalone entry points and runtime closure
- Inspect sibling frontend/configuration assets
- Extract the final release archive and verify its notices and relink/source materials

### Browser builds

Do not assume a build dependency's license applies to generated output. Determine whether the tool
copies its own covered code or other licensed material into the result. For example, an unmodified
MPL-licensed CSS compiler used only as a tool does not make its generated CSS MPL merely by
processing it.

### Container images

Do not rely solely on language-package manifests. Inspect:

- Base image and immutable digest
- OS binary packages and their exact source-package mapping
- Runtime licenses outside the OS package database, such as `/usr/local` Node/npm files
- Globally installed tools and copied executables
- License/copyright files retained by image slimming
- Entrypoint downloads and persistent-volume installations

## 4. License Compatibility

Compatibility analysis applies to the actual combined or aggregated artifact, not to every pair of
licenses that happens to appear in one lockfile.

| Situation                                                   | Required assessment                                                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Apache-2.0 code combined with GPL-2.0-only code             | Review the Apache patent terms and whether the works are actually combined                                |
| GPL-2.0-only combined with GPL-3.0-only                     | Determine whether any "or later" permission or exception resolves the conflict                            |
| Permissive code combined with AGPL code                     | Combined covered work may need AGPL terms; mere aggregation does not cause that result                    |
| Proprietary/FSL application linked to LGPL                  | Usually possible if LGPL notice, source, relink, modification, and reverse-engineering conditions are met |
| Proprietary/FSL application distributed beside GPL programs | Determine whether they are independent works in mere aggregation                                          |
| Non-commercial or service-restricted terms                  | Compare exact restrictions with actual commercial and hosting use                                         |

Record the selected license branch for every multi-license component and the evidence supporting
that selection.

## 5. Attribution and Notice Compliance

### Repository material

| Check | Criterion                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Project license agrees across `LICENSE`, every package manifest that declares one, documentation, and UI notices (Step 0) |
| `[ ]` | Material copied from a template or starter keeps that template's copyright and license notice                             |
| `[ ]` | Generated third-party summary matches the exact resolved production closure                                               |
| `[ ]` | Per-package copyright, license text, and applicable upstream `NOTICE` material are preserved                              |
| `[ ]` | Fonts and other non-code assets retain their required license and notices                                                 |

### Final-artifact material

| Check | Criterion                                                                         |
| ----- | --------------------------------------------------------------------------------- |
| `[ ]` | Every final archive contains the project license and required third-party notices |
| `[ ]` | License subdirectories and source/relink offers survive packaging                 |
| `[ ]` | Container images retain OS and runtime license/copyright files                    |
| `[ ]` | Registry tarballs include the files promised by repository documentation          |
| `[ ]` | Artifact checks fail when no artifact exists instead of returning a false pass    |

If a staging directory and a final archive both exist, inspect the final archive. A correct staging
tree does not prove that compression, filtering, or upload preserved its contents.

## 6. Copyleft Source and Relink Compliance

### LGPL linked libraries

For each LGPL component, record:

- Exact library and license version
- Static or dynamic linking mechanism
- Prominent notice and supplied license text
- Exact corresponding library source, including distributor modifications
- Application object code or source and build material sufficient to replace/relink the library
- Terms permitting recipient modification and reverse engineering for debugging those changes
- Which LGPL conveyance option the distributor relies on

### GPL-family components

For every distributed GPL component, record the exact license version and corresponding source
delivery method.

- **GPLv2 written offers:** Verify the offer is valid for at least three years, covers any third
  party where required, and can supply complete corresponding source for no more than distribution
  cost.
- **GPLv3 network distribution:** When object code is offered from a network server, verify
  equivalent access to corresponding source in the same way and at no further charge. A request-only
  promise is not a substitute for the applicable network-server option.
- **Containers:** Map binary packages to exact source-package names and versions. Preserve Debian or
  other distributor patches and build scripts, not only upstream project links.

Primary references:

- [LGPL 2.1](https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html)
- [GPL 2.0](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html)
- [GPL 3.0](https://www.gnu.org/licenses/gpl-3.0.html)
- [GNU license FAQ](https://www.gnu.org/licenses/gpl-faq.html)
- [Debian source package policy](https://www.debian.org/doc/debian-policy/ch-source.html)

### Fulfillment evidence

A source offer passes only when the promised materials can be identified and delivered.

| Check | Criterion                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------- |
| `[ ]` | Every artifact hash or image digest maps to exact source revisions and package versions                   |
| `[ ]` | Source archives include submodules, patches, build scripts, and required object/relink material           |
| `[ ]` | Contact route is active and the offer contains no placeholders                                            |
| `[ ]` | Retention starts from the last distribution of the corresponding artifact                                 |
| `[ ]` | A dry-run fulfillment demonstrates that the materials can be assembled without relying on moving branches |

## 7. Historical and Public Distribution

The audit must review what recipients can download now, not only what the next release will contain.

| Check | Criterion                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------- |
| `[ ]` | All public releases, package versions, and image tags are listed                                      |
| `[ ]` | Materially different historical artifact formats are sampled or inspected individually                |
| `[ ]` | Current compliance fixes are confirmed in a published tag or digest before claiming resolution        |
| `[ ]` | Historical artifacts use version-matched notices and corresponding source material                    |
| `[ ]` | Incomplete artifacts are replaced, supplemented appropriately, or withdrawn                           |
| `[ ]` | Source-offer retention continues after an artifact is removed when the applicable license requires it |

Do not attach current dependency notices to an older binary unless the dependency closure and
embedded runtime are proven identical.

## 8. Continuous Compliance and Drift

Continuous gates should support, not replace, the quarterly and pre-release audit.

| Check | Criterion                                                                          |
| ----- | ---------------------------------------------------------------------------------- |
| `[ ]` | Dependency changes regenerate and verify the distributed runtime inventory         |
| `[ ]` | Unknown/custom/copyleft classifications fail closed pending review                 |
| `[ ]` | Release workflows inspect final archives after packaging                           |
| `[ ]` | Container checks run against the exact image intended for publication              |
| `[ ]` | Source-package and artifact-digest records are generated at release time           |
| `[ ]` | Public registry/release visibility is checked before "not distributed" is accepted |
| `[ ]` | License drift between locked versions is reviewed                                  |

Avoid a universal allowlist that treats every weak-copyleft dependency as safe. Repository-native
generators should preserve actual license expressions and carry manual classifications for unusual
terms.

## aidd and Spernakit Applicability

### aidd

aidd is licensed `FSL-1.1-ALv2`: the root `LICENSE` is the Functional Source License 1.1 with the
Apache 2.0 future license, and the root `package.json` `license` field carries the same
identifier. Each version becomes available under Apache-2.0 on the second anniversary of the date
it was made available. Confirm both files still agree. FSL on aidd's own code is not a finding.
aidd is a distributed tool, not a relaxed internal-only application.

**How aidd is distributed, as last verified.** Verify each statement against the live repository
and its public releases before relying on it; this paragraph is a starting point, not evidence.

- aidd is distributed as **source**: a git clone, or the source archive the hosting service
  generates for a release tag. The release workflow (`.github/workflows/release.yml`) creates a
  release from notes only and attaches no built asset.
- The npm dependency graph is not redistributed. The recipient's own `bun install` fetches it, and
  the frontend is built on the recipient's machine during that install.
- The repository defines no compiled executable and no container image.

Under that model the mandatory aidd surfaces are:

- The tracked source tree at each release tag, including the catalog directories it publishes
  (`audits`, `skills`, `scaffolding`, `prompts`, `recipes`) and any material vendored into them
- `licenses/distributed-materials.json`, the exact-path registry that classifies repository
  material distributed outside the npm graph, and the registry code under
  `scripts/lib/third-party-licenses/`
- The generated `THIRD-PARTY-LICENSES.md` and `THIRD-PARTY-NOTICES.md`
- Every public release and its assets, checked on the hosting service, not inferred from the
  workflow file

Read the implementations of, and run only the read-only forms of:

```text
bun run check:licenses        # check:license-core, then the generator with --check
bun run check:fresh-release
bun run check:source-install
```

`bun run licenses:generate` rewrites the committed documents; do not run it in an audit. The
license core (`scripts/check-license-core.ts` and `scripts/lib/license-core/`) is synchronized
from Spernakit and must not be edited in aidd. A defect in it is reported against Spernakit.

Checks specific to this model:

| Check | Criterion                                                                                                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Every tracked file under a published catalog directory is classified in `licenses/distributed-materials.json`; none is unclassified    |
| `[ ]` | Third-party material vendored into the tree (skills, scaffolding, prompts, fonts, images) carries its license and notice in the tree   |
| `[ ]` | `check:licenses` fails when a new dependency has an unreviewed license; read the generator's handling of flagged packages to confirm   |
| `[ ]` | No public release carries a binary asset. Record the release list and each release's asset count as the evidence                       |
| `[ ]` | No workflow, script, or documented step builds or pushes an executable or an image. This is an absence claim: run the control (Rule 5) |

**If the model has changed.** If aidd ships a compiled executable, a packaged release archive, or
a container image, whether now or in any release still publicly downloadable, the "source only"
conclusion is void for that artifact. Then the Bun standalone executable checks (Section 3), the
container checks, and the copyleft source and relink checks (Section 6) all apply to it: the
embedded Bun runtime and its statically linked components, the browser assets packaged beside it,
the image's base-system packages, and any tools baked into the image. A release check must then
target the real packaged artifact and fail when that artifact does not exist.

### Spernakit and derived applications

Spernakit, the template, is MIT-licensed: its `LICENSE` is the MIT text and its `package.json`
`license` field is `MIT`. **A derived application owns its own license** and is not expected to
carry the template's.

**What initialization does, from the template release that follows v3.47.4.** Setup calls
`claimAppLicense` (`scripts/lib/setup/license-materials.ts`, reached through
`updateLicenseFiles`). When the app's `LICENSE` is still the template's MIT text, it writes an
all-rights-reserved `LICENSE` and sets the `package.json` `license` field to `UNLICENSED`. It
leaves the app alone when either of these is true:

- the app's `.templateoverrides` carries a `KEEP LICENSE` line, or
- the `LICENSE` file no longer begins with the MIT text.

Initialization then seeds `KEEP LICENSE` into `.templateoverrides` (`seedTemplateOverrides` in
`scripts/lib/init/scaffold.ts`), so later template upgrades do not restore MIT over the app's
file. Confirm this behavior in the Spernakit checkout the app registers, and record which
template version the app was created from and last upgraded to.

**Release timing.** This behavior is in the template's main branch after tag v3.47.4. Until a
template release includes it, and for every app created before that release, initialization
copied the template's MIT `LICENSE` unchanged. Such an app can still carry an MIT file and
`"license": "MIT"` that nobody chose.

Checks for a derived application:

| Check | Criterion                                                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | `LICENSE` and the `package.json` `license` field agree (Step 0). `UNLICENSED` with an all-rights-reserved file is a pass                                                         |
| `[ ]` | An app with an owner-chosen license (any license, including MIT chosen on purpose) has `KEEP LICENSE` in `.templateoverrides`, so an upgrade cannot overwrite it                 |
| `[ ]` | An inherited MIT file is identified: the text matches the template's and nothing records that the owner chose it. Raise it with the owner. Do not rewrite it                     |
| `[ ]` | The copyright line names the app's actual owner. `claimAppLicense` carries the holder over from the template's copyright line, which is right only when the same party owns both |
| `[ ]` | Where the app's owner is not the template's copyright holder, the template's MIT copyright and permission notice is kept for the template material the app contains (Section 5)  |
| `[ ]` | The generated third-party documents describe the app's own terms the way `LICENSE` does (an `UNLICENSED` app is described as proprietary, not as MIT)                            |
| `[ ]` | `licenses/SOURCE-OFFER.md` has no placeholders before any image is published; an app that never publishes may have removed it and the publication scripts                        |

Do not report any of these as a defect: a derived app that is `UNLICENSED`; a derived app whose
license differs from the template's; a `KEEP LICENSE` line.

For an inherited MIT file, the finding states the facts and leaves the decision with the owner:
which versions were published under MIT and to whom, whether the owner wants to keep MIT or
choose other terms, and that replacing the file changes the terms for future versions only.
Severity is Medium when the app has not been distributed outside its owner, and High when copies
or a public repository went out under the unintended license.

Separate these distribution cases:

- Publishing template source distributes source and vendored material.
- Building an image locally as proof does not distribute that image.
- Pushing an image, handing it to another person or organization, or publishing a release does.
- Derived applications must audit their own dependency closure, branding/assets, and artifacts.
- Build-only Lightning CSS does not license generated CSS under MPL merely because it processed the
  source; verify that compiler code is not copied into the artifact.

Do not mark a template image "not distributed" solely because the package manifest is private.
Verify registry visibility, workflows, documentation, and actual push behavior. In a derived app,
read `check:image-publication` and the image push script to confirm both refuse to ship while the
source offer is missing or still has placeholders.

### Other projects

For a CLI, static site, mobile app, or library that is neither aidd nor Spernakit-derived, none of
the script or file names above are expected. Apply Step 0 and Sections 1-8 to what the project
actually ships: a registry tarball, a deployed static bundle, an app-store binary, or a source
archive. A mobile binary conveys every bundled native and JavaScript dependency to its users, and
a static site conveys its bundled scripts, styles, and fonts.

## Audit Checklist

### Critical checks

- [ ] No distributed component lacks an identified license grant
- [ ] No unresolved GPL/AGPL/SSPL/custom term is combined incompatibly with the artifact
- [ ] Every distributed LGPL-linked executable has a valid source/relink compliance route
- [ ] GPL corresponding source is available through an option valid for its license and delivery method
- [ ] Existing public artifacts are included in the assessment

### High-priority checks

- [ ] Every distribution surface and final artifact is inventoried
- [ ] Embedded runtimes, native libraries, container packages, and vendored material are covered
- [ ] Per-package license and applicable `NOTICE` content reaches recipients
- [ ] Source offers are operationally fulfillable and tied to immutable artifact identifiers
- [ ] Browser-delivered assets are not incorrectly classified as server-only SaaS code
- [ ] "Build-only" and "not distributed" conclusions have falsification evidence

### Medium-priority checks

- [ ] The project's `LICENSE` file and every manifest `license` field agree; the owner's choice
      itself (`UNLICENSED`, FSL, or any other) is not reported as a defect
- [ ] An inherited, unchosen license file is raised with the owner and left unmodified
- [ ] SPDX expressions and selected license branches are documented
- [ ] Build/development dependencies are separated from distributed closures
- [ ] Package metadata agrees with packaged license files and upstream provenance
- [ ] License drift checks run on dependency changes
- [ ] Automated checks fail closed on absent artifacts

### Low-priority checks

- [ ] Trademark use does not imply endorsement
- [ ] Patent-termination clauses relevant to the selected licenses are documented
- [ ] Audit results are compared with the previous report

## Report Template

```markdown
# Licensing Audit Report - YYYY-MM-DD

## Executive Summary

**Application:** {name}
**Project license:** {license and evidence}
**LICENSE file and manifest `license` field agree:** yes / no - {both values quoted}
**Compliance status:** PASS / FAIL / REQUIRES REVIEW
**Critical findings:** {count}
**High findings:** {count}

## Distribution Artifact Matrix

| Artifact         | Distributed? | Identifier        | Inspected evidence | Status    |
| ---------------- | ------------ | ----------------- | ------------------ | --------- |
| Release ZIP      | yes/no       | tag + SHA-256     | extracted paths    | pass/fail |
| Browser assets   | yes/no       | build/tag         | bundle evidence    | pass/fail |
| Container        | yes/no       | digest            | image inventory    | pass/fail |
| Registry package | yes/no       | version/integrity | tarball contents   | pass/fail |

## Component Inventory Summary

| Scope                   | Components | Unknown | Copyleft | Restrictive | Status      |
| ----------------------- | ---------- | ------- | -------- | ----------- | ----------- |
| Runtime package closure | {N}        | {N}     | {N}      | {N}         | pass/review |
| Embedded/native runtime | {N}        | {N}     | {N}      | {N}         | pass/review |
| Container base system   | {N}        | {N}     | {N}      | {N}         | pass/review |
| Build-only tools        | {N}        | {N}     | {N}      | {N}         | pass/review |

## Attribution and Artifact Status

| Requirement             | Repository | Final artifact | Evidence | Status    |
| ----------------------- | ---------- | -------------- | -------- | --------- |
| Project license         | yes/no     | yes/no         | {path}   | pass/fail |
| Third-party notices     | yes/no     | yes/no         | {path}   | pass/fail |
| Upstream NOTICE content | yes/no/N/A | yes/no/N/A     | {path}   | pass/fail |
| Copyleft license texts  | yes/no/N/A | yes/no/N/A     | {path}   | pass/fail |

## Corresponding Source and Relink Status

| Component/artifact | License   | Delivery option | Exact source mapping | Fulfillment tested | Status    |
| ------------------ | --------- | --------------- | -------------------- | ------------------ | --------- |
| {component}        | {license} | {option}        | {digest/tag/package} | yes/no             | pass/fail |

## Historical Public Artifacts

| Artifact            | Still available? | Version-matched notices/source? | Action            |
| ------------------- | ---------------- | ------------------------------- | ----------------- |
| {tag/image/package} | yes/no           | yes/no/unknown                  | keep/fix/withdraw |

## Methodology Validity

- Enforcing implementation citations complete: yes/no
- Falsification records required: {count}
- Falsification records present: {count}
- Green-gate-only controls found: {none/list}
- Absence claims and their known-positive controls: {list}

## Findings

### {Finding title}

- **Severity:** Critical / High / Medium / Low
- **Artifact/component:** {identifier}
- **License:** {SPDX or exact custom terms}
- **Evidence:** {file:line, artifact path, command result}
- **Impact:** {specific obligation or restriction}
- **Remediation:** {actionable fix}

## Recommendations

### Immediate

1. {Stop, replace, withdraw, or correct a failing distribution}

### Before next release

1. {Artifact, source, or automation remediation}

### Ongoing

1. {Drift, retention, and dependency-approval controls}
```

## Deliverables

1. Licensing audit report at `.aidd/audit-reports/LICENSING-YYYY-MM-DD.md`
2. Artifact matrix covering every real distribution surface
3. Distributed-component inventory with license and provenance evidence
4. Corresponding-source/relink matrix for every applicable copyleft component
5. Falsification records for every "build-only," "not distributed," "N/A," or equivalent decision
6. `feature.json` remediation entry for each verified actionable finding

Do not create a separate inventory file when the repository already has an accurate generated
inventory. Reference it from the report and record the command that verified it.

## Success Criteria

- [ ] The project's own license is stated consistently, and no owner's choice was reported as a defect
- [ ] Every distributed artifact and historical public artifact is accounted for
- [ ] Every shipped component has an identified license and provenance record
- [ ] No incompatible license combination remains unresolved
- [ ] Required license texts, copyright notices, and applicable `NOTICE` content reach recipients
- [ ] LGPL replacement/relink rights are practical, not merely described
- [ ] GPL corresponding source is available through a delivery method valid for the license version
- [ ] Source offers are version-matched, retained, and demonstrably fulfillable
- [ ] Build-only and non-distribution conclusions are supported by artifact and registry evidence
- [ ] Continuous checks inspect real artifacts and fail closed

---
title: 'Third-Party Software Licensing Audit'
last_updated: '2026-07-13'
version: '2.0'
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
> and never score a control from a green gate alone.

This audit determines what third-party material a project actually distributes and whether each
distributed artifact carries the notices, permissions, source, and relink materials its licenses
require. Package metadata is supporting evidence; the final artifact is the primary evidence.

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

- The project's own license and real distribution posture are documented.
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

These terms are not open-source licenses and require individual review.

| License family          | Typical concern                                                         |
| ----------------------- | ----------------------------------------------------------------------- |
| SSPL                    | Service-side conditions extend beyond ordinary open-source copyleft     |
| BSL / BUSL              | Use restrictions apply until the stated change date                     |
| Elastic License 2.0     | Managed-service and circumvention restrictions                          |
| Commons Clause          | Selling or commercial-hosting restrictions layered onto another license |
| CC-BY-NC                | Commercial use prohibited                                               |
| Proprietary or custom   | Rights depend entirely on the supplied terms or commercial agreement    |
| `SEE LICENSE IN <file>` | Read the referenced file; package metadata alone is not the license     |

### Unknown and missing information

| Observation                          | Required action                                                             |
| ------------------------------------ | --------------------------------------------------------------------------- |
| Missing `package.json` license field | Inspect packaged license files and exact-version upstream source            |
| Non-SPDX or ambiguous string         | Read the actual terms and normalize only after manual review                |
| `UNLICENSED` metadata                | Determine whether it is a private-package marker or genuinely lacks a grant |
| No packaged license file             | Check registry provenance and the exact tagged source release               |
| No license grant found after review  | Block distribution, replace the component, or obtain permission             |

## Pre-Audit Setup

### Step 0: Establish the project's own license

Read the root `LICENSE` or equivalent legal file first. Treat a package manifest's `license` field
as metadata that should agree with it. `private: true` prevents accidental registry publication;
it does not make a project proprietary and it is not sticky licensing metadata for derived work.

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

Typical Bun repository commands, when present:

```text
bun run check:licenses
bun run release:package
bun run check:release-notices
bun run check:image-licenses
bun pm ls --all
```

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

| Check | Criterion                                                                                    |
| ----- | -------------------------------------------------------------------------------------------- |
| `[ ]` | Project license agrees across `LICENSE`, package metadata, documentation, and UI notices     |
| `[ ]` | Generated third-party summary matches the exact resolved production closure                  |
| `[ ]` | Per-package copyright, license text, and applicable upstream `NOTICE` material are preserved |
| `[ ]` | Fonts and other non-code assets retain their required license and notices                    |

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

aidd is `FSL-1.1-ALv2`, converting each released version to Apache-2.0 after two years. It is a
distributed CLI/control panel, not a relaxed internal-only application.

Mandatory aidd surfaces:

- Standalone GitHub release archives containing Bun-compiled CLI and web executables
- Browser assets packaged beside the web executable
- Bun itself and its statically linked JavaScriptCore/WebKit and TinyCC components
- aidd's container image whenever it is published or provided to another party
- Debian base packages, Node/npm runtime files, and any baked-in agent tools in that image

Run and inspect the implementations of:

```text
bun run check:licenses
bun run release:package
bun run check:release-notices
bun run release:check
bun run check:image-licenses
```

Confirm that release checks target `dist/release`, inspect the final ZIP, and fail if the expected
artifact does not exist. Confirm that current licensing fixes have reached every still-downloadable
public release.

### Spernakit and derived applications

Spernakit is an MIT-licensed source template. Separate these cases:

- Publishing template source distributes source and vendored material.
- Building an image locally as proof does not distribute that image.
- Pushing an image, handing it to another person or organization, or publishing a release does.
- Derived applications must audit their own dependency closure, branding/assets, and artifacts.
- Build-only Lightning CSS does not license generated CSS under MPL merely because it processed the
  source; verify that compiler code is not copied into the artifact.

Do not mark a template image "not distributed" solely because the package manifest is private.
Verify registry visibility, workflows, documentation, and actual push behavior.

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

- [ ] Every distributed artifact and historical public artifact is accounted for
- [ ] Every shipped component has an identified license and provenance record
- [ ] No incompatible license combination remains unresolved
- [ ] Required license texts, copyright notices, and applicable `NOTICE` content reach recipients
- [ ] LGPL replacement/relink rights are practical, not merely described
- [ ] GPL corresponding source is available through a delivery method valid for the license version
- [ ] Source offers are version-matched, retained, and demonstrably fulfillable
- [ ] Build-only and non-distribution conclusions are supported by artifact and registry evidence
- [ ] Continuous checks inspect real artifacts and fail closed

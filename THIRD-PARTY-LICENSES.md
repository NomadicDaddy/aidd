# Third-Party Licenses

aidd is distributed under the
[Functional Source License 1.1 (ALv2 future license)](./LICENSE)
(`FSL-1.1-ALv2`). FSL is a Fair Source license, not an open-source license: each
version converts to Apache-2.0 two years after its release. The third-party
dependencies below keep their own licenses regardless; FSL does not override them.

aidd is distributed as source — a git clone, or the source archive GitHub generates for each
release tag. Nothing in the npm graph travels with it, so the tables below inventory what aidd
builds against rather than what it redistributes. Material vendored directly into the repository
is the exception, and the notices it requires are carried by this document,
[`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md), and [`licenses/`](./licenses).

The npm tables enumerate the _direct_ production dependencies and summarize the rest of the npm
graph by license family. The non-package section is generated from
[`licenses/distributed-materials.json`](./licenses/distributed-materials.json), which classifies
the repository material distributed outside the npm graph.

## Backend and CLI runtime dependencies

| Package                                                                              | Version | License    |
| ------------------------------------------------------------------------------------ | ------- | ---------- |
| [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | 1.30.0  | MIT        |
| [@xterm/addon-serialize](https://www.npmjs.com/package/@xterm/addon-serialize)       | 0.14.0  | MIT        |
| [@xterm/headless](https://www.npmjs.com/package/@xterm/headless)                     | 6.0.0   | MIT        |
| [bun-pty](https://www.npmjs.com/package/bun-pty)                                     | 0.4.10  | MIT        |
| [croner](https://www.npmjs.com/package/croner)                                       | 10.0.1  | MIT        |
| [drizzle-orm](https://www.npmjs.com/package/drizzle-orm)                             | 0.45.2  | Apache-2.0 |
| [elysia](https://www.npmjs.com/package/elysia)                                       | 1.4.30  | MIT        |
| [pino](https://www.npmjs.com/package/pino)                                           | 10.3.1  | MIT        |
| [zod](https://www.npmjs.com/package/zod)                                             | 4.5.4   | MIT        |

## Frontend runtime dependencies

| Package                                                                                                | Version | License    |
| ------------------------------------------------------------------------------------------------------ | ------- | ---------- |
| [@dnd-kit/core](https://www.npmjs.com/package/@dnd-kit/core)                                           | 6.3.1   | MIT        |
| [@dnd-kit/sortable](https://www.npmjs.com/package/@dnd-kit/sortable)                                   | 10.0.0  | MIT        |
| [@dnd-kit/utilities](https://www.npmjs.com/package/@dnd-kit/utilities)                                 | 3.2.2   | MIT        |
| [@fontsource-variable/geist](https://www.npmjs.com/package/@fontsource-variable/geist)                 | 5.3.0   | OFL-1.1    |
| [@fontsource-variable/geist-mono](https://www.npmjs.com/package/@fontsource-variable/geist-mono)       | 5.3.0   | OFL-1.1    |
| [@fontsource-variable/space-grotesk](https://www.npmjs.com/package/@fontsource-variable/space-grotesk) | 5.3.0   | OFL-1.1    |
| [@tanstack/react-query](https://www.npmjs.com/package/@tanstack/react-query)                           | 5.102.8 | MIT        |
| [@xterm/addon-fit](https://www.npmjs.com/package/@xterm/addon-fit)                                     | 0.11.0  | MIT        |
| [@xterm/addon-search](https://www.npmjs.com/package/@xterm/addon-search)                               | 0.16.0  | MIT        |
| [@xterm/addon-web-links](https://www.npmjs.com/package/@xterm/addon-web-links)                         | 0.12.0  | MIT        |
| [@xterm/addon-webgl](https://www.npmjs.com/package/@xterm/addon-webgl)                                 | 0.19.0  | MIT        |
| [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)                                             | 6.0.0   | MIT        |
| [cmdk](https://www.npmjs.com/package/cmdk)                                                             | 1.1.1   | MIT        |
| [lucide-react](https://www.npmjs.com/package/lucide-react)                                             | 1.42.0  | ISC        |
| [react](https://www.npmjs.com/package/react)                                                           | 19.2.8  | MIT        |
| [react-dom](https://www.npmjs.com/package/react-dom)                                                   | 19.2.8  | MIT        |
| [react-router](https://www.npmjs.com/package/react-router)                                             | 8.3.1   | MIT        |
| [sonner](https://www.npmjs.com/package/sonner)                                                         | 2.0.8   | MIT        |
| [tailwind-merge](https://www.npmjs.com/package/tailwind-merge)                                         | 3.6.0   | MIT        |
| [web-vitals](https://www.npmjs.com/package/web-vitals)                                                 | 6.2.1   | Apache-2.0 |
| [zustand](https://www.npmjs.com/package/zustand)                                                       | 5.0.15  | MIT        |

## Non-package distributed material

These files are distributed from the repository rather than the npm dependency graph.
Their exact-path ownership and immutable provenance are defined in
[`licenses/distributed-materials.json`](./licenses/distributed-materials.json).

| Material                              | Covered paths                     | Author/rightsholder                                                                  | License   | Status  | Source                                                                                                                                                            |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------ | --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contributor-covenant-2.1              | `CODE_OF_CONDUCT.md`              | Contributor Covenant contributors, maintained by the Organization for Ethical Source | CC-BY-4.0 | adapted | [pinned source (2.1)](https://github.com/EthicalSource/contributor_covenant/blob/8a3be1350b07f38b53bbc7073f765a48c4c53ce1/content/version/2/1/code_of_conduct.md) |
| vercel-composition-patterns-audit     | `audits/COMPOSITION_PATTERNS.md`  | Vercel Labs                                                                          | MIT       | adapted | [pinned source](https://github.com/vercel-labs/agent-skills/tree/4559f18a20c1691c744b4395194290db6a0df5e9/skills/composition-patterns)                            |
| vercel-react-best-practices-audit     | `audits/REACT_BEST_PRACTICES.md`  | Vercel Labs                                                                          | MIT       | adapted | [pinned source](https://github.com/vercel-labs/agent-skills/tree/4559f18a20c1691c744b4395194290db6a0df5e9/skills/react-best-practices)                            |
| vercel-web-interface-guidelines-audit | `audits/WEB_DESIGN_GUIDELINES.md` | Vercel Labs                                                                          | MIT       | adapted | [pinned source](https://github.com/vercel-labs/web-interface-guidelines/blob/4e799d45c17aec1498c269287a83b9dba22b966b/command.md)                                 |

## Required notices by license family

### Apache License 2.0

Applies to: drizzle-orm, web-vitals.

These packages are licensed under the Apache License, Version 2.0. A copy of
the license is available at <https://www.apache.org/licenses/LICENSE-2.0>.
The software is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. Where a package ships a
`NOTICE` file, that file travels with the package in `node_modules` and its
attributions apply.

### ISC License

Applies to: lucide-react.

> Permission to use, copy, modify, and/or distribute this software for any
> purpose with or without fee is hereby granted, provided that the above
> copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
> REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
> FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
> INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
> LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
> OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
> PERFORMANCE OF THIS SOFTWARE.

### MIT License

Applies to: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, @modelcontextprotocol/sdk, @tanstack/react-query, @xterm/addon-fit, @xterm/addon-search, @xterm/addon-serialize, @xterm/addon-web-links, @xterm/addon-webgl, @xterm/headless, @xterm/xterm, bun-pty, cmdk, croner, elysia, pino, react, react-dom, react-router, sonner, tailwind-merge, zod, zustand.

Each MIT-licensed dependency is provided under the standard MIT License, with
copyright held by the respective package authors as stated in that package.
The permission notice and warranty disclaimer below apply to each of them.

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

### SIL Open Font License 1.1

Applies to: @fontsource-variable/geist, @fontsource-variable/geist-mono, @fontsource-variable/space-grotesk.

The bundled font files are licensed under the SIL Open Font License, Version
1.1, available at <https://openfontlicense.org>. The fonts may be used,
studied, modified, and redistributed freely so long as they are not sold by
themselves and any derivative reserved names are not used without permission.
The license and copyright notice must be retained with the font files, which
are included in the distributed asset tree.

## Runtime dependency closure

The tables above enumerate the direct production dependencies. Counting everything they
pull in transitively, the runtime closure is **176** third-party
packages (173 unique names). Development and build tooling is not part
of it and is not counted here. Its license distribution is:

| License      | Packages |
| ------------ | -------- |
| MIT          | 157      |
| ISC          | 9        |
| BSD-3-Clause | 3        |
| OFL-1.1      | 3        |
| Apache-2.0   | 2        |
| 0BSD         | 1        |
| BSD-2-Clause | 1        |

No copyleft or weak-copyleft licensed package (GPL, AGPL, SSPL, EUPL, CDDL,
OSL, MPL) appears in the runtime closure. Build tooling is a separate question and
is not inventoried here.

## Scope and known gaps

Scope limits of the tables above, recorded rather than left implicit:

- **Transitive npm packages are not enumerated.** The tables list direct production
  dependencies only; the remainder of the graph appears as license-family counts.
- **Repository-distributed material is registry-backed.** Catalog files, public documents, and
  public static assets outside the npm graph are classified by exact path in
  `licenses/distributed-materials.json`. New or missing paths fail `check:licenses`.
- **Build and development tooling is not inventoried.** The counts above cover the packages aidd
  resolves at runtime, read from the manifests and the lockfile.

Per-package copyright lines, license text and `NOTICE` files for the whole runtime closure are
reproduced in [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md), which ships alongside this
file.

## Regenerating this file

This document is generated from the installed dependency graph and
`licenses/distributed-materials.json`. Run `bun run licenses:generate` after changing
dependencies or distributed-material provenance, and commit the result.
`bun run check:licenses` (part of `smoke:qc` and CI) regenerates it in memory and
fails when the committed copy no longer matches what is installed.

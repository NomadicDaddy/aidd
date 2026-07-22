# Corresponding source and relink materials offer

aidd is distributed as standalone executables (and, when published, as a container image). Those
artifacts redistribute the Bun runtime, which **statically links** JavaScriptCore/WebKit (LGPL-2)
and TinyCC (LGPL-2.1). A container image additionally redistributes the Debian base system, which
includes GPL- and LGPL-licensed packages.

Static linking is the case the LGPL is most specific about: a recipient must be able to modify the
LGPL library and relink it into the program. Pointing at an upstream repository is not sufficient
on its own, so this is a standing offer rather than a link.

For every aidd release and image that includes this file, NomadicDaddy offers to give **any third
party** — not only recipients of the artifact — the following materials, on request:

- the complete source tree for the exact Bun version identified in the artifact, including its
  pinned submodules and the patched WebKit/JavaScriptCore and TinyCC sources;
- the source, object files, build scripts, and other machine-readable materials needed to rebuild
  Bun with a modified LGPL component and produce a replacement executable — that is, the materials
  required to relink the program against a modified library; and
- for a container image, the complete corresponding source and build scripts for every GPL- or
  LGPL-licensed base-system package identified in the accompanying
  [`base-image-packages.md`](./base-image-packages.md).

The materials are available by electronic transfer at no charge. Physical transfer, if requested,
will cost no more than the reasonable cost of performing that transfer. This offer remains valid
for at least three years after the last distribution of the corresponding artifact.

**Network access to source (GPL-3 components).** Artifacts are conveyed over a network, and for
GPL-3-licensed components a written offer is not the applicable route: the licence asks for
equivalent access to the corresponding source from the same or a specified place. Accordingly, for
the GPL-3 components of the container's Debian base system, corresponding source for the exact
source package and version recorded in [`base-image-packages.md`](./base-image-packages.md) is
available from Debian's source servers at <https://sources.debian.org> (and from
<http://deb.debian.org/debian/pool/main/> by source package name). Those directions are maintained
alongside the artifacts for as long as the artifacts remain available, and the offer above stands
in addition to them.

**Identifying the exact sources.** Every release archive contains
[`SOURCE-MANIFEST.md`](./SOURCE-MANIFEST.md), which records the aidd commit, the Bun version and
tag (whose submodules pin the exact WebKit/JavaScriptCore and TinyCC revisions), and the dependency
lockfile hash for that binary. The same facts are retained per release under `licenses/releases/`,
keyed by the artifact's SHA-256, so a request about a binary downloaded long ago can be answered
against the sources it was actually built from rather than whatever upstream happens to be today.

To request the materials, email `phillip@beazley.org` or open an issue at
<https://github.com/NomadicDaddy/aidd/issues>. Identify the artifact by its release tag and the
SHA-256 recorded in `SHA256SUMS.txt`, or, for an image, by its immutable digest — a moving tag is
not enough to identify the binary you received.

**Relinking without waiting for us.** aidd's own source is available under
[FSL-1.1-ALv2](../LICENSE), so the whole executable can be rebuilt against a Bun you have
modified:

1. Build a modified Bun per <https://github.com/oven-sh/bun/blob/main/LICENSE.md>:
   `git submodule update --init --recursive`, `make jsc`, `zig build`. This compiles
   JavaScriptCore and Bun's bindings to it and produces a `bun` binary with your changes.
2. Rebuild aidd with that Bun: `bun run build:standalone`, which invokes `bun build --compile`.
   The resulting executable carries your modified JavaScriptCore.

Applying the LGPL to the linked library does not place aidd's own application code under the LGPL;
the LGPL exists precisely to permit non-LGPL programs to link against it. aidd's code remains under
FSL-1.1-ALv2.

For convenience, the principal upstream source locations are:

- Bun: <https://github.com/oven-sh/bun>, at the `bun-v<version>` tag recorded by the artifact;
- Bun's patched WebKit: <https://github.com/oven-sh/webkit>, pinned by that Bun source tree;
- TinyCC: <https://github.com/TinyCC/tinycc>; and
- Debian package sources: <https://sources.debian.org>.

These links do not replace the offer above. Generic links to current upstream branches are not an
adequate substitute for source matching the binary you received, so digest-to-source records are
kept for as long as each artifact remains available.

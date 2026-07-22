# Release source records

Each distributed release carries a source record that maps every artifact SHA-256 to the exact
aidd commit, Bun tag, and dependency lockfile used to build it. This makes the corresponding-source
offer in [`../SOURCE-OFFER.md`](../SOURCE-OFFER.md) fulfillable for the artifact a recipient holds.

`bun run release:package` writes `source-record-vX.Y.Z.md` beside the release assets. A local
maintainer build also writes a copy here; CI publishes the release-asset copy instead because its
workspace is temporary.

Retain each source record and its referenced sources for at least three years after the last
distribution of the corresponding artifacts. Private retention procedures belong outside the
public repository.

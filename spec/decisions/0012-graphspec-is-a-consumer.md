---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: GraphSpec Is A Consumer Of ModelSpec

**Status:** Approved
**Date:** 2026-07-08
**Owner:** alexander.trakhimenok@gmail.com
**Tags:** architecture, graphspec, boundaries
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

Earlier drafts of this repository stated in several places that "GraphSpec is
intentionally outside this architecture". That wording was written to defend
ModelSpec's independence, but it over-corrected: it specified mutual ignorance
between the two languages. The observable consequence was that GraphSpec bootstrap
examples began embedding their own `fields:` and `properties:` blocks, re-encoding
structural truth outside ModelSpec — exactly the drift ModelSpec exists to prevent.

The SpecScore family decision "One Structural Language" (specscore decision 0003)
resolves the boundary: ModelSpec owns structure; GraphSpec owns connected domain
semantics and references ModelSpec models instead of redefining them.

## Decision

GraphSpec is a consumer of ModelSpec, exactly like OpenVaultDB and generators:

- GraphSpec artifacts may reference ModelSpec models, components, and enums
  (for example `model: modelspec://reservations.Booking`).
- ModelSpec never references GraphSpec. No ModelSpec concept, validation rule, or
  serialization may depend on GraphSpec's existence.
- ModelSpec remains independently adoptable: a project can use ModelSpec without
  GraphSpec, SpecScore, or OpenVaultDB.

Repository documents that framed GraphSpec as "outside the architecture" are updated
to this consumer framing.

## Rationale

Independence is a statement about dependency direction, not about acquaintance. The
guarantee ModelSpec's adopters need is that the arrow never points out of ModelSpec —
which this decision preserves. Listing GraphSpec among consumers costs nothing and
removes the incentive for GraphSpec (or any future semantic layer) to grow a parallel
structural vocabulary.

## Declined Alternatives

### Mutual ignorance (previous wording)

Rejected because it pushed structural definitions into GraphSpec examples and would
have produced two divergent structural vocabularies inside one family.

### Merging GraphSpec concerns into ModelSpec

Rejected. Modules, ownership, relationships-with-semantics, commands, events, and
lifecycle are behavior/boundary concerns; ModelSpec's out-of-scope list deliberately
excludes them, and that boundary is one of ModelSpec's strengths.

## Consequences at Decision Time

- README, `docs/architecture.md`, `docs/specscore.md`, and `spec/README.md` replace
  the "intentionally outside" framing with the consumer framing.
- GraphSpec tooling that resolves `model:` references will consume ModelSpec's
  serialized AST (JSON) or HCL sources; ModelSpec needs no change for this beyond
  stable IDs.
- The "not a sub-language of GraphSpec" statement remains true and is retained.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*

---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: Named Enums Are A Core Concept

**Status:** Approved
**Date:** 2026-07-08
**Owner:** alexander.trakhimenok@gmail.com
**Tags:** model,enum,vocabulary
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

The core model carried `enum` only as an inline constraint check on a single
property. Controlled vocabularies that are reused across entities, components,
collections, and downstream consumers (booking statuses, currency codes, country
codes, roles) had no named, id-addressable home. GraphSpec's bootstrap had filled
that gap with its own EnumSpec kind — which the family decision "One Structural
Language" removes, on the condition that ModelSpec provides the home.

## Decision

ModelSpec adds a named, top-level `enum` concept:

```hcl
enum "BookingStatus" {
  values = ["requested", "confirmed", "cancelled"]
}

entity "Booking" {
  key = ["id"]

  property "id" {
    type = "uuid"
  }

  property "status" {
    type = "string"
    enum = "BookingStatus"
  }
}
```

- An enum has a name, an ordered list of values, and optional per-value metadata
  (description, deprecation) in future revisions.
- The existing inline `enum` constraint (a literal value list on one property)
  remains valid for single-use vocabularies; a property may instead reference a
  named enum by name.
- Externally governed vocabularies (ISO currency, country codes) are named enums
  whose value lists may be marked as externally sourced in a future revision rather
  than enumerated inline.

## Rationale

Reuse without a named form means copy-paste value lists that drift — the same
argument that justified components over repeated field groups. A named enum is also
the addressable target other family members need: GraphSpec, generators, and
validators can reference `modelspec://reservations.BookingStatus` only if the concept has
a name and an ID.

Note the boundary with GraphSpec: lifecycle *states* of a domain entity are declared
in GraphSpec's `lifecycle:` block because transitions and their semantics are domain
behavior. Named enums cover data vocabularies — values that type properties.

## Declined Alternatives

### Inline enum checks only (status quo)

Rejected: no reuse, no addressability, and it would have forced GraphSpec to keep
its own EnumSpec.

### Enums as single-field components

Rejected: a component is a group of fields; overloading it to mean "a value list"
muddies both concepts and gives generators no clear signal.

## Consequences at Decision Time

- `spec/core-model.md` gains an Enum section and the HCL grammar gains an `enum`
  block; the JSON serialization gains a corresponding node.
- Validation adds: duplicate enum names, empty value lists, duplicate values,
  unresolved enum references from properties.
- The initial type system is unchanged; an enum constrains a `string` (or `int`)
  property rather than introducing a new primitive type.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*

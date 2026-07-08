---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: Module-Qualified Cross-Module References

**Status:** Approved
**Date:** 2026-07-08
**Owner:** alexander.trakhimenok@gmail.com
**Tags:** model,references,modules,composition
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

Entity references (`entity = "User"`), component embedding
(`component = "Auditable"`, `use = [...]`), and named-enum references
(`enum = "BookingStatus"`) were same-module names only. The first consumer pilot hit
both missing cases in a single small slice: a property referencing another module's
entity, and an entity embedding another module's component (a shared time-window
value object). Forbidding cross-module references would force per-module copies of
shared components — reintroducing exactly the drift components exist to prevent.

The consumer's ecosystem has a cross-reference resolution model of its own
(SpecScore's path-based linkage), but ModelSpec must not depend on SpecScore or any
other consumer: the dependency arrow never points out of ModelSpec
([decision 0012](0012-graphspec-is-a-consumer.md)).

## Decision

ModelSpec adds **module-qualified names** as reference syntax, with resolution
delegated to the consumer.

### Syntax

Wherever a reference attribute accepts a name — `entity`, `component`, `enum`, and
`use` list entries — the value MAY be module-qualified:

```hcl
entity "Booking" {
  key = ["id"]

  property "id" {
    type = "uuid"
  }

  property "space" {
    entity   = "core.Space"          # cross-module entity reference
    required = true
  }

  property "timeWindow" {
    component = "calendarius.TimeWindow"   # cross-module component embedding
    required  = true
  }

  property "role" {
    type = "string"
    enum = "core.SpaceRole"          # cross-module named-enum reference
  }
}
```

A qualified name is `<module>.<Name>`: a module short name, one dot, a concept name.
Bare names remain same-module references. Concept names within a module MUST NOT
contain dots, so the form is unambiguous.

### Semantics

- Qualified references are **read-only**: they type a property, embed a component's
  fields, or constrain values. They never modify, extend, or re-declare the
  referenced concept, and they introduce no inheritance.
- The referencing module has a **dependency** on the referenced module. The AST and
  JSON serialization preserve qualified names verbatim, so consumers can derive a
  module-dependency graph.

### Resolution is consumer-provided

ModelSpec defines *what a qualified name means*, not *where modules are found*. A
consumer supplies the module resolver:

- SpecScore-managed trees resolve module short names by placement and configuration
  (SpecScore decisions 0006/0007) — ModelSpec remains unaware of this.
- OpenVaultDB and other standalone consumers resolve against their own module
  registry via the JSON serialization's `module.id`/`module.name`.

A validator MUST report a qualified reference whose module is not present in the
consumer-provided module set as an unresolved reference — the same diagnostic class
as an unresolved bare name.

## Rationale

Qualified names are the smallest addition that keeps shared components single-sourced.
Delegating resolution keeps the independence guarantee intact: the syntax mentions no
host, path, repository, or consumer concept — only module names, which ModelSpec
already has. Read-only semantics avoid the cross-module override/extension tar pit
entirely.

## Declined Alternatives

### Forbid cross-module references (typed-id convention)

Rejected: degrades typed references to bare scalars (the pilot's `spaceId: uuid`
lost the fact that it targets `core.Space`) and forces per-module copies of shared
components, which drift.

### An `import`/`from` statement

Rejected for v0: adds grammar and aliasing questions without adding power — the
qualified name already names the module. Revisit only if deep nesting or renaming
needs emerge.

### Consumer-linkage syntax inside HCL (e.g. SpecScore references)

Rejected: any consumer-specific reference form inside ModelSpec source flips the
dependency arrow that decision 0012 protects.

### Global URL-style references (`github.com/org/repo.Entity`)

Rejected: bakes packaging into the language. Global identity lives in the JSON
serialization's `module.id`; source-level names stay short and portable.

## Consequences at Decision Time

- Core model, HCL grammar, and JSON format documents gain the qualified-name form
  and the unresolved-qualified-reference validation requirement.
- Cross-module references make module dependencies derivable from models; consumers
  MAY surface or lint that dependency graph (SpecScore's GraphSpec checks it against
  ModuleSpec `dependsOn`).
- The first consumer pilot's speculative `component = "calendarius.TimeWindow"`
  syntax becomes legal as written.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*

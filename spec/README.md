# ModelSpec Specification

ModelSpec is an open specification language for application data models.

The specification defines the logical model that generators, validators, and storage
systems consume. It is storage-agnostic, language-agnostic, and backend-agnostic.

## Contents

| Path | Purpose |
|---|---|
| [core-model.md](core-model.md) | Entities, components, enums, relationships, collections, recordsets, constraints, and validation. |
| [hcl-authoring.md](hcl-authoring.md) | HCL authored source format. |
| [json-format.md](json-format.md) | JSON serialization of the ModelSpec AST. |
| [projections.md](projections.md) | Logical-to-physical projection model and advisory backend mapping hints. |
| [migration-metadata.md](migration-metadata.md) | Versioning and migration metadata carried by a model. |
| [out-of-scope.md](out-of-scope.md) | Boundaries that ModelSpec intentionally does not cross. |
| [decisions/](decisions/README.md) | Architectural decisions retained from the original design. |

## Design Principles

- Define the application data model once.
- Keep the logical model independent from storage layout.
- Prefer composition over inheritance.
- Make projections explicit and reviewable.
- Treat backend mappings as generated or advisory, not as the semantic source of truth.
- Keep ModelSpec independent from OpenVaultDB, SpecScore, GraphSpec, and any single generator.

## Relationship To Adjacent Projects

OpenVaultDB consumes ModelSpec directly for schema validation, migration planning,
backend mapping, GraphQL generation, DTQL typing metadata, DALGO metadata, and backend
generators.

SpecScore validates ModelSpec documents and may provide linting, validation, and
semantic checks. SpecScore does not define ModelSpec semantics.

GraphSpec consumes ModelSpec. GraphSpec describes connected domain models — modules,
relationships, commands, events, lifecycle — and references ModelSpec models,
components, and enums for structure instead of redefining it. ModelSpec never
references GraphSpec; see
[decision 0012](decisions/0012-graphspec-is-a-consumer.md).

## Open Questions

- **Cross-module references.** `entity = "..."` property references and component
  embedding are same-module names today. The first consumer pilot needed both a
  property referencing another module's entity and an embedded component owned by
  another module (a shared time-window value object). Should ModelSpec add qualified
  names / an import mechanism for read-only cross-module references, or forbid them
  (forcing typed-id conventions and per-module component copies, which reintroduces
  drift for shared value objects)? *(Raised 2026-07-08.)*
- **Module identity in HCL.** See [hcl-authoring.md](hcl-authoring.md#open-questions).

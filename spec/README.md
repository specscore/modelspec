# ModelSpec Specification

ModelSpec is an open specification language for application data models.

The specification defines the logical model that generators, validators, and storage
systems consume. It is storage-agnostic, language-agnostic, and backend-agnostic.

## Contents

| Path | Purpose |
|---|---|
| [core-model.md](core-model.md) | Entities, components, relationships, collections, recordsets, constraints, and validation. |
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

GraphSpec is not part of the ModelSpec architecture. GraphSpec describes connected
domain models; ModelSpec describes application data models and their storage-neutral
schema projections.

## Open Questions

- Should ModelSpec include migration capabilities beyond descriptive metadata?

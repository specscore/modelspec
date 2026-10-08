# ModelSpec Specification

ModelSpec is an open specification language for application data models.

The specification defines the logical model that validators read today, and that
generators and storage systems are meant to consume. It is storage-agnostic,
language-agnostic, and backend-agnostic.

## Contents

| Path | Purpose |
|---|---|
| [core-model.md](core-model.md) | Entities, components, enums, relationships, collections, recordsets, constraints, and validation. |
| [hcl-authoring.md](hcl-authoring.md) | HCL authored source format. |
| [json-format.md](json-format.md) | JSON serialization of the ModelSpec AST. |
| [projections.md](projections.md) | Logical-to-physical projection model and advisory backend mapping hints. |
| [migration-metadata.md](migration-metadata.md) | Versioning and migration metadata carried by a model. |
| [out-of-scope.md](out-of-scope.md) | Boundaries that ModelSpec intentionally does not cross. |
| [decisions/](decisions/README.md) | Architectural decisions. |

## Design Principles

- Define the application data model once.
- Keep the logical model independent from storage layout.
- Prefer composition over inheritance.
- Make projections explicit and reviewable.
- Treat backend mappings as generated or advisory, not as the source of truth for the model.
- Keep ModelSpec independent from OpenVaultDB, SpecScore, GraphSpec, and any single generator.

## Relationship To Adjacent Projects

ModelSpec says what shape data has. MeaningGraph says what the data means, and
OpenVaultDB says where it is
([decision 0017](decisions/0017-one-question-per-layer.md)).

MeaningGraph binds meanings to models: a meaning file points at a ModelSpec entity or
property by its address. ModelSpec never references MeaningGraph and states no
meaning of its own.

OpenVaultDB describes databases: a published database names the model it follows, and
`ovdb publisher check` verifies that the recordsets the publisher lists are the
entities of that model. Using a model inside a vault for schema validation, migration
planning, backend mapping, GraphQL generation, DTQL typing metadata, DALGO metadata,
and backend generators is the intended integration. None of it is implemented.

GraphSpec is not one of those three layers. It describes how one application's
objects behave, and it takes their structure from ModelSpec, as described below.

SpecScore validates ModelSpec documents and may provide linting, validation, and
semantic checks. SpecScore does not define ModelSpec semantics.

GraphSpec consumes ModelSpec. GraphSpec describes connected domain models — modules,
relationships, commands, events, lifecycle — and references ModelSpec models,
components, and enums for structure instead of redefining it. ModelSpec never
references GraphSpec; see
[decision 0012](decisions/0012-graphspec-is-a-consumer.md).

## Approved Changes Not Yet In Force

Decisions 0018 to 0020 are approved and change the grammar. Decision 0021 is approved
and changes how a published model's references are resolved. None of them is in
force. This specification describes the grammar that tools read today, and the
decisions they succeed stand as written until each change takes effect.
[Decision 0022](decisions/0022-prose-now-format-change-on-the-owners-word.md) says
when they start.

| Decision | Succeeds, when it takes effect |
|---|---|
| [0018 Entity Becomes Record](decisions/0018-entity-becomes-record.md) | Part of 0014. |
| [0019 Collection And Recordset Removed, Three Words Reserved](decisions/0019-collection-and-recordset-removed-three-words-reserved.md) | 0003, and part of 0007, 0009 and 0015. 0004 loses its subject, and so do two of the three rules of 0002. |
| [0020 Field Is The Member Word](decisions/0020-field-is-the-member-word.md) | Part of 0002. |
| [0021 A Published Model Pins The Models It Refers To](decisions/0021-published-model-pins-the-models-it-refers-to.md) | Amends 0014. |

## Open Questions

- **Module identity in HCL** (standalone distribution only). See
  [hcl-authoring.md](hcl-authoring.md#open-questions). Cross-module references were
  resolved by [decision 0014](decisions/0014-module-qualified-references.md)
  (module-qualified names, consumer-provided resolution).
- **Polymorphic references (union types).** A property today references exactly one
  entity or component. Consumer pilots keep hitting "reference to any of several
  principal-like entities" (e.g. an authorization subject or an audit actor that may
  be a user, an application, or an automated agent). The current idiom — an optional
  typed reference plus a string discriminator/scope — works but pushes the
  constraint out of the model. Should ModelSpec support a union/interface reference
  form, and if so at what cost to backend mapping simplicity?

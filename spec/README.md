# ModelSpec Specification

ModelSpec is an open specification language for application data models.

The specification defines the logical model that validators read today, and that
generators and storage systems are meant to consume. It is storage-agnostic,
language-agnostic, and backend-agnostic.

## Contents

| Path | Purpose |
|---|---|
| [core-model.md](core-model.md) | Record types, fields, components, enums, references, constraints, validation, the deprecated spellings, and the removed and reserved words. |
| [hcl-authoring.md](hcl-authoring.md) | HCL authored source format. |
| [json-format.md](json-format.md) | JSON serialization of the ModelSpec AST. |
| [projections.md](projections.md) | Why `projection` is reserved, and where a mapping to a real database is written. |
| [migration-metadata.md](migration-metadata.md) | Why `migration` is reserved, and what ModelSpec will not do about migrations. |
| [out-of-scope.md](out-of-scope.md) | Boundaries that ModelSpec intentionally does not cross. |
| [decisions/](decisions/README.md) | Architectural decisions. |

## Design Principles

- Define the application data model once.
- Keep the logical model independent from storage layout.
- Prefer composition over inheritance.
- Keep statements about one database with that database, not in the model.
- Keep ModelSpec independent from OpenVaultDB, SpecScore, GraphSpec, and any single generator.

## Relationship To Adjacent Projects

ModelSpec says what shape data has. MeaningGraph says what the data means, and
OpenVaultDB says where it is
([decision 0017](decisions/0017-one-question-per-layer.md)).

MeaningGraph binds meanings to models: a meaning file points at a ModelSpec record
type or field by its address. ModelSpec never references MeaningGraph and states no
meaning of its own.

OpenVaultDB describes databases: a published database names the model it follows, and
`ovdb publisher check` verifies that the recordsets the publisher lists are the
record types of that model. Using a model inside a vault for schema validation, migration
planning, backend mapping, GraphQL generation, DTQL typing metadata, DALGO metadata,
and backend generators is the intended integration. None of it is implemented.

GraphSpec is not one of those three layers. It describes what an application's
objects do and how they are connected, and it takes their structure from ModelSpec,
as described below.

SpecScore validates ModelSpec documents and may provide linting, validation, and
semantic checks. SpecScore does not define ModelSpec semantics.

GraphSpec consumes ModelSpec. GraphSpec describes connected domain models — modules,
relationships, commands, events, lifecycle — and references ModelSpec models,
components, and enums for structure instead of redefining it. ModelSpec never
references GraphSpec; see
[decision 0012](decisions/0012-graphspec-is-a-consumer.md).

## Transition

The grammar changed in 2026: `entity` became `record`, a record type's `property`
became `field`, and two constructs were removed
([decisions 0018](decisions/0018-entity-becomes-record.md),
[0019](decisions/0019-collection-and-recordset-removed-three-words-reserved.md) and
[0020](decisions/0020-field-is-the-member-word.md)). The change is staged
([decision 0022](decisions/0022-prose-now-format-change-on-the-owners-word.md)):

| Stage | State |
|---|---|
| This specification and the reference CLI describe and read the current spelling, and still read the deprecated one. | Done. |
| Other readers accept both spellings; then writers emit the current one. | Not done. Until it is, other tools and modelspec.org's registry pages still say "entity" and "property", and other readers accept only the deprecated spelling: the public registry's check refuses a model in the current one. |
| Each registered model is rewritten and its pin moved. | Not done. Every registered model is in the deprecated spelling today, and is valid. |
| A deprecated spelling becomes an error. | Not done. It follows the stage above. The owner's statement of 9 October 2026 about it, and how it was read, is in decision 0022's observed consequences. |

Decision 0022 lists the specification among the writers of its second step. The
grammar chapters changed earlier, with the reference CLI, because decisions 0018 to
0020 each place the grammar and the reference CLI in Phase 2.

So a registered model should stay in the deprecated spelling until the registry
reads the current one. A new model can be written in the current spelling and checked
with the reference CLI today.

[Decision 0021](decisions/0021-published-model-pins-the-models-it-refers-to.md) is
approved and not in force: resolution of a module-qualified name is still left to the
consumer, as decision 0014 says.

Earlier decisions that these changes succeed stay in the decisions index as Approved.
SpecScore cannot link an approved successor to them, and they were not moved to an
archive; decision 0022's observed consequences give the reason. Each carries a dated
entry in its own observed consequences:

| Decision | What became of it |
|---|---|
| 0002 Property, Field, And Column Are Distinct | None of its three rules remains (0019, 0020). |
| 0003 Collection Kind, Not Table Type | Succeeded in whole by 0019. |
| 0004 Opaque Query Seam | No subject left (0019). |
| 0007 HCL Blocks And Recordset Column Order | Succeeded in part by 0019. |
| 0009 HCL v0 Grammar Scope | Succeeded in part by 0019; 0018 and 0020 change the words it lists. |
| 0014 Module-Qualified Cross-Module References | Succeeded in part by 0018. |
| 0015 Concept Namespaces And Reserved Names | Succeeded in part by 0019; 0018 changes a word it lists. |

## Open Questions

- **Module identity in HCL** (standalone distribution only). See
  [hcl-authoring.md](hcl-authoring.md#open-questions). Cross-module references were
  resolved by [decision 0014](decisions/0014-module-qualified-references.md)
  (module-qualified names, consumer-provided resolution).
- **What a reference holds.** A reference names a record type. Nothing says which of
  the target's fields the value matches: the reference reader accepts a reference to
  a record type with no key, and to one whose key has several fields, as two
  references in a registered model are. Should a reference say which key it holds?
- **A field named like a component's field.** Field names are unique within a record
  type, and a key may name a field supplied by a component. The reference reader does
  not refuse a record type's own field that repeats the name of a field from a
  component it uses. Should it?
- **Polymorphic references (union types).** A field today references exactly one
  record type or component. Consumer pilots keep hitting "reference to any of several
  principal-like record types" (e.g. an authorization subject or an audit actor that
  may be a user, an application, or an automated agent). The current idiom — an optional
  typed reference plus a string discriminator/scope — works but pushes the
  constraint out of the model. Should ModelSpec support a union/interface reference
  form, and if so at what cost to backend mapping simplicity?

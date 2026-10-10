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
| Other readers accept both spellings. | Mostly done. These read both: SpecScore CLI 0.55.0, MeaningGraph CLI 0.3.0, OpenVaultDB's publisher CLI 0.42.0, CodeGrapher 0.16.0, the public ModelSpec registry's check, and the sites modelspec.org, meaninggraph.io and the OVDB Directory site. On 9 October 2026 CodeGrapher's web client did not read the current spelling. |
| Writers emit the current spelling. | Begun. The registry pages of modelspec.org say "record type" and "field", and answer the anchors `#record-Name` and `#field-Record-member` as well as the earlier `#entity-Name` and `#property-Record-member`. The public ModelSpec registry's index writes `records` and `fields`. Other writers follow in their own changes. |
| Each registered model is rewritten and its pin moved. | Done. No registered model is pinned in the deprecated spelling. |
| A deprecated spelling becomes an error. | Done, for a model that is being checked: in this specification, and in the reference CLI from version 0.3.0. A document that a pin names stays readable. No other reader changed with this stage. |

Decision 0022 lists the specification among the writers of its second step. The
grammar chapters changed earlier, with the reference CLI, because decisions 0018 to
0020 each place the grammar and the reference CLI in Phase 2.

The last stage has a scope, which decision 0022 does not state: its step reads "The
old spelling becomes an error only when no registered pin uses it, and only with its
own approval." The error is for a model that is being written, changed or
registered. A document that a pin names keeps its spelling and stays readable, and a
model that refers to such a document is not made invalid by it.
[core-model.md](core-model.md#deprecated-spellings) states both rules, with an
example of each. The first is required of the reference CLI and is what this
specification asks of every other checker, which follows by its own decision.

In the reference CLI from version 0.3.0, `modelspec lint` and
`modelspec export` fail for a model that holds a deprecated spelling, a module that
is supplied only to resolve references keeps a warning, and `modelspec rewrite`
still reads the deprecated spelling in order to rewrite it.

This stage changes this specification and the reference CLI, and no other checker.
On 10 October 2026 three of the readers named in the table did not report a
deprecated spelling as an error in a model they check. SpecScore CLI 0.55.0
(`specscore graph lint`) gave an advisory notice of severity `info`. The public
ModelSpec registry's check printed a notice for each registry record whose files
were in the deprecated spelling. OpenVaultDB's publisher check (`ovdb publisher
check` 0.43.0) reported nothing about the spelling. Each run ended with exit status
0; [core-model.md](core-model.md#checkers-that-do-not-report-the-error) says what
each did.

A registry record that is being added, or whose commit is being moved, offers a
model for registration, and the first rule governs that model. A record that stands
is a pin, and the document it names is read under the second rule: for such a
record a notice without a refusal is what the second rule asks. The public
registry's check did not tell the two apart on 10 October 2026, and it did not run
the reference CLI. Refusing a model that is being registered, or whose pin is being
moved, is a change for that registry to make.

That scope was chosen by the implementing session on the recommendation of a census
of 9 October 2026. The owner approved making the old spelling an error and has been
told of the scope. His words, the scope and the alternatives that were not taken are
in decision 0022's observed consequences.

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

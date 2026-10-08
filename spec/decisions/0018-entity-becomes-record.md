---
format: https://specscore.md/decision-specification
status: Draft
---

# Decision: Entity Becomes Record

**Status:** Draft
**Date:** 2026-10-08
**Owner:** alexander.trakhimenok@gmail.com
**Tags:** model,terminology,record
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

"Entity" is declared in several adjacent open formats, and each means something
different:

| Where | As written | What it is |
|---|---|---|
| MeaningGraph concept kind | `kind: entity` | A thing with instances, such as an invoice. |
| MeaningGraph binding role | `role: entity` | The rows of a ModelSpec entity are instances of the concept. |
| ModelSpec block | `entity "Invoice" { … }` | A typed structure with properties and an optional key. |
| GraphSpec kind | `kind: entity` | A domain object with a lifecycle, which points at a ModelSpec entity for its structure. |

[Issue 21](https://github.com/specscore/modelspec/issues/21) records the owner's
feedback: "We should either remove entities from ModelSpec, or, if they needed,
rename so we do not confuse them with MeaningGraph entities."

The construct is needed. In the public ModelSpec registry on 8 October 2026, nine
registered models declare 140 entities and 156 references between them. A reference
is a statement about structure that holds whether or not a database declares a
foreign key, and it can hold between two databases.

The question was put to the owner as decision D2 of the conceptual design proposal
written for issue 21.

Named unknown: whether `records` joins or replaces `entities` among the reserved
names of [decision 0015](0015-concept-namespaces-and-reserved-names.md). Those names
are the kind tokens of a consumer's reference syntax, so the answer follows the
successor of SpecScore decision 0011 and is settled in Phase 2.

## Decision

ModelSpec's `entity` is renamed `record`, and is called a record type in prose. The
wording put to the owner:

> Rename ModelSpec's entity to record, called a record type in prose: the block, the
> reference attribute and the JSON key. Addresses do not change.

The owner's answer, 8 October 2026: "Approve record".

The card said that approving it as written also fixes three details, and the owner
changed none of them: the JSON format identifier `1.0-draft-2`, the search kind
`model_record` and the page anchor `#record-Name`.

| | In force today | When this decision takes effect |
|---|---|---|
| Block | `entity "Invoice" { … }` | `record "Invoice" { … }` |
| Reference | `entity = "Customer"` | `record = "Customer"` |
| JSON key | `entities` | `records` |
| JSON format identifier | `1.0-draft` | `1.0-draft-2` |
| Word in prose | entity | record type |
| Registry page anchor | `#entity-Name` | `#record-Name` |
| Search kind | `model_entity` | `model_record` |
| Addresses | `modelspec://host/org/repo/module`, `module.Name` | Unchanged |

### Takes effect

Phase 2 for the grammar, the reference CLI, its corpus and the JSON form. Phase 3 for
the readers and writers, in this repository's site code and in other repositories,
and for pinning the registered models anew. Neither has started. Both wait for the owner's word
([decision 0022](0022-prose-now-format-change-on-the-owners-word.md)).

Until then `entity` is the grammar in force and the specification describes it.

### Decisions succeeded

When it takes effect, this decision succeeds part of
[decision 0014](0014-module-qualified-references.md): the name of the reference
setting, `entity = "module.Name"`. The rest of 0014 stands: the qualified-name form,
its read-only meaning and the dependency it implies.

The card also named part of SpecScore decision 0011, which reserves the kind word
`entities` in SpecScore's reference syntax. That decision lives in the SpecScore
repository and needs its own successor there.

Decision 0014 stays approved and unedited, and this file's `Supersedes` field is
empty at approval, because 0014 is in force until the grammar changes and only part
of it is succeeded. How the supersession is recorded is settled when the first
successor takes effect (decision 0022).

Recorder's notes, not part of the owner's answer. The proposal's author read the
approval as covering the supersession named on the card, and told the owner so as a
reading to correct; no correction is recorded. The rename also reaches the word
`entity` where decisions 0009 and 0015 spell it; the card did not name them for this
decision. The proposal's migration section keeps the old page anchor, `#entity-Name`,
as an alias; the card names the new anchor only.

## Rationale

The construct earns its place; its name does not. "Record" says what the construct
is: the type of one record. The specification already speaks of an entity's
"records". Declaring a type with this word has precedent: Avro's named, fielded type
is a record, and Java, C# and Pascal declare record types with that keyword.

The cost is that "record" also means one row elsewhere, in OpenVaultDB's API among
others. So the declaration is called a record type in prose, every time, and the
proposal has OpenVaultDB's files spell their mapping key `record_type` once that
format changes.

Addresses carry no kind word, so no address changes and no binding in a meaning file
has to be rewritten for this rename.

## Declined Alternatives

### Keep the word and fix the explanation

No migration. Declined: the collision stays, and every binding line keeps two
meanings of "entity" side by side.

### Remove the construct and bind meanings straight to tables

One layer fewer. Declined: a reference could then be stated only per database. It
would have no home for a source that is not a database, between two databases, or in
an application model that has no database yet.

### Replace the construct with an overlay on a database's own schema

Names, types and keys would come from the engine, with no duplication. Declined as
the format: a model would stop existing without a database beside it, and a binding
would point at one database's column. Adopted as a working method: a model of an
existing database is generated from its schema, not typed.

### record_type

Cannot be read as a row anywhere, and it is the phrase the prose needs. Declined as
the keyword: two words for the most-typed keyword, and `record_type = "Customer"`
reads less well than `record = "Customer"`. It was the runner-up, offered to the
owner as "Use record_type".

### type

Declined: components and enums are types too, and `type = "string"` already exists on
every member.

### model

Declined: OpenVaultDB and the registry use "model" for the whole module.

### struct, object or schema

Declined: `struct` is a nested value in SQL engines, which is ModelSpec's component;
`object` has the same type-or-instance doubt as `record`; `schema` already means a
database namespace and a whole format.

### shape

The clearest contrast with "meaning". Declined: components and enums are shapes too.
The word is used for the layer, not the construct.

### Rename MeaningGraph's kind instead

The cheapest change. Declined: the issue asks the opposite, "entity" for a business
concept is what data people expect, and ModelSpec's text would still claim meaning.

## Consequences at Decision Time

- Every registered model's source changes: 140 block headers and 156 references in
  nine models, counted on 8 October 2026. They are rewritten by a command, not by
  hand, and generated models are regenerated.
- Readers accept both spellings until the last registered model is pinned anew
  (decision 0022). A commit that is pinned today keeps its old spelling and stays
  readable.
- The JSON form carries a new format identifier so that a strict reader can tell
  which vocabulary it holds. HCL has no version marker: the keyword tells a reader
  which vocabulary it sees.
- SpecScore decision 0011 needs a successor in the SpecScore repository.
- Readers and writers change in Phase 3, in this repository's site code and in other
  repositories.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*

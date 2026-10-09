---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: Collection And Recordset Removed, Three Words Reserved

**Status:** Approved
**Date:** 2026-10-08
**Owner:** alexander.trakhimenok@gmail.com
**Tags:** model,grammar,collection,recordset,projection
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

The reference CLI recognises seven top-level block types: `entity`, `component`,
`enum`, `collection`, `recordset`, `projection` and `migration`. It also recognises an
`index` block nested in an entity.

The nine models in the public ModelSpec registry, counted on 8 October 2026, declare
140 entities and nothing else: no collection, no recordset, no projection, no
migration and no index.

Two of the unused constructs are defined. `collection` and `recordset` have sections
in the core model, and the reference CLI reads them.

Three are not. `projection`, `index` and `migration` are shown by example in the
specification, and no document defines their settings or how they map to the JSON
form. The reference CLI records each such block as unmapped and does not read its
content. The content of a projection is shown three different ways: a `record_file`
block in the projections chapter, an `indexes` map in the JSON chapter, and a nested
`index` block in the repository README and on modelspec.org.

The question was put to the owner as decision D3 of the conceptual design proposal
written for [issue 21](https://github.com/specscore/modelspec/issues/21).

Named unknown: which of the five reserved names of
[decision 0015](0015-concept-namespaces-and-reserved-names.md) remain once
`collections` and `recordsets` name nothing. It is settled in Phase 2, with the
successor of SpecScore decision 0011.

## Decision

Two parts. The wording put to the owner:

> a. Remove collection and recordset from ModelSpec. b. Make projection, index and
> migration reserved words with no content.

The owner's answer, 8 October 2026: part a, "Remove both"; part b, "Reserve all
three".

The card says where the jobs go: "A stored set of rows is what OVDB calls a
recordset, and the shape of a query's result is a record type with no key", and a
feature specification that says what it reads "names the record type, and the
recordset once a database exists". A record type is today's entity
([decision 0018](0018-entity-becomes-record.md)).

From the proposal's section 3, not on the card the owner answered: the order of
columns, and a column name that repeats, are facts about one physical result and not
about the shape; and a feature specification names the entity by the two-part
address that already works, `module.Name`.

`projection`, `index` and `migration` stay reserved so that a later version can
define them. Until then a model has no place to say where its rows should be stored.

### Takes effect

Phase 2: the grammar, the reference CLI and its corpus, and the specification's
chapters. It has not started and waits for the owner's word
([decision 0022](0022-prose-now-format-change-on-the-owners-word.md)).

Until then the specification describes `collection` and `recordset` as the grammar in
force, and shows `projection`, `index` and `migration` by example, labelled as
examples no tool reads.

### Decisions succeeded

When it takes effect, this decision succeeds:

- [Decision 0003](0003-collection-kind.md), Collection Kind, in whole.
- Part of [decision 0007](0007-hcl-blocks-and-recordset-column-order.md): the rule
  that recordset columns are an ordered array that allows duplicate names. Singular
  named blocks, and object maps for uniquely named concepts, stand.
- Part of [decision 0009](0009-hcl-v0-grammar-scope.md): `collection`, `recordset` and
  `column` leave the list of blocks, and `projection` becomes a reserved word with no
  content. The constrained grammar, with no dynamic expressions, stands.
- Part of [decision 0015](0015-concept-namespaces-and-reserved-names.md): the separate
  name scopes for collections and recordsets, and their kind-explicit addresses. The
  one namespace shared by entities, components and enums stands.

[Decision 0004](0004-query-seam.md), Opaque Query Seam, loses its subject. It governs
query metadata on computed collections and recordsets, and with both gone nothing in
a model carries a query. It is not reversed: ModelSpec gains no query language.

Those decisions stay approved and unedited, and this file's `Supersedes` field is
empty at approval, because they are in force until the grammar changes and three of
them are succeeded only in part. How the supersession is recorded is settled when
the first successor takes effect (decision 0022).

Recorder's notes, not part of the owner's answer. The proposal's author read the
approval as covering the supersession named on the card, and told the owner so as a
reading to correct; no correction is recorded. The card named 0003, 0007, 0009 and
0015; that 0004 loses its subject is stated in the proposal's migration section and
its hand-off. [Decision 0008](0008-migration-capabilities-out-of-scope.md) is not
named and what it decides stands: ModelSpec executes no migrations. Two of the three
rules of [decision 0002](0002-property-field-column.md), that a collection has fields
and a recordset has columns, lose their blocks by this decision; the cards name 0002
under D4 only ([decision 0020](0020-field-is-the-member-word.md)).

## Rationale

Part a. A construct that the reference CLI reads and no model uses costs every other
reader: two block types, a member word of its own for the recordset, and two more
name scopes. Each job has
a better home. OpenVaultDB already describes stored sets of rows, next to an actual
database, where the statement can be checked. A keyless entity already describes the
shape of a result.

Part b. A block that is shown by example, never defined and read by nothing is not
part of a format. Readers cannot agree on what it contains, because the specification
shows three shapes for it. Reserving the words keeps them free for a version that
defines them.

## Declined Alternatives

### Keep both

No change to the grammar. Declined: no registered model uses either, and every reader
keeps paying for them.

### Keep one

Keep `collection` or keep `recordset`. Declined: a collection restates what a
database's description already lists, and a recordset is a keyless entity plus facts
about one physical result.

### Define projection instead

Give `projection` a grammar, so that one mapping could serve every database with the
same layout. Declined for now: it is a claim about a database, written where no
database is, so it cannot be checked from the model. It would need a grammar, readers
in every parser and a first consumer.

### Leave the three words as they are

Keep showing the blocks by example. Declined: a reader of the specification or of
modelspec.org takes an example for a feature, and a consumer can rely on nothing in
it.

## Consequences at Decision Time

- In Phase 2 the specification's Collection, Recordset and Indexes sections and its
  projection and migration chapters are rewritten, and the projection example leaves
  the repository README and modelspec.org.
- No registered model changes for this decision. The reference CLI's corpus declares
  these blocks and changes with the grammar.
- The site's code that renders collections and exports them to search retires in
  Phase 3.
- An application author who wants to suggest where rows are stored has no place to do
  so until a later version defines one.

## Observed Consequences

2026-10-09 — In force. The specification's chapters no longer define `collection` or `recordset` and mark `projection`, `index` and `migration` as reserved, and the reference CLI refuses all five from version 0.2.0 (modelspec-org/cli). No registered model was affected. The specification's own example model declared a collection and a recordset and was rewritten. The named unknown above was not settled in Phase 2: `records` is reserved beside the five names of decision 0015, as a choice of the implementing session, and the final list is an open question in `spec/hcl-authoring.md`.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*

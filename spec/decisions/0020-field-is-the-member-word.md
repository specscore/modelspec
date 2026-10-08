---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: Field Is The Member Word

**Status:** Approved
**Date:** 2026-10-08
**Owner:** alexander.trakhimenok@gmail.com
**Tags:** model,terminology,field
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

[Decision 0002](0002-property-field-column.md) gave ModelSpec three words for a
member, one per block: an entity has properties, a collection has fields, a recordset
has columns. A component has fields too.

[Decision 0019](0019-collection-and-recordset-removed-three-words-reserved.md) removes
the collection and the recordset. That leaves two words for one thing: `property` in
an entity and `field` in a component. In the public ModelSpec registry on 8 October
2026 the nine registered models declare 895 properties and no component.

The question was put to the owner as decision D4 of the conceptual design proposal
written for [issue 21](https://github.com/specscore/modelspec/issues/21). The
proposal recommended `property`, the word with the most uses.

## Decision

ModelSpec has one word for a member, `field`, in entities and in components. The
wording put to the owner, and the three answers offered:

> One word for a member in ModelSpec: property, in record types and in components.
>
> Approve · Use field for both · Leave as is

The owner's answer, 8 October 2026: "Use field for both".

The same day he described the idea behind it: "My original idea was to use different
member names on each level", so that "when you name field 'Gender' you know what
level it is". The proposal sets the idea out as one word per level: property in
MeaningGraph, field in ModelSpec, column in OpenVaultDB.

| | In force today | When this decision takes effect |
|---|---|---|
| Member of an entity | `property "email" { … }` | `field "email" { … }` |
| Member of a component | `field "createdAt" { … }` | Unchanged |

Recorder's note, not part of the owner's one-line answer. The proposal's author
recorded two things the answer reaches, and told the owner that it reaches further
than the card said: the JSON key `properties` becomes `fields`, and the member
anchors on modelspec.org, `#property-Name-member`, keep an alias. Whether MeaningGraph
takes up the word `property` is a decision for MeaningGraph's format and is not
recorded here.

### Takes effect

Phase 2 for the grammar, the reference CLI, its corpus and the JSON form. Phase 3 for
the readers and writers, in this repository's site code and in other repositories.
Neither has started. Both wait for the
owner's word
([decision 0022](0022-prose-now-format-change-on-the-owners-word.md)).

Until then `property` is the grammar in force for an entity's members, and the
specification describes it.

### Decisions succeeded

When it takes effect, this decision succeeds part of decision 0002: the rule that an
entity has properties. The other two rules of 0002, that a collection has fields and
a recordset has columns, lose their blocks by decision 0019.

Decision 0002 stays approved and unedited, and this file's `Supersedes` field is
empty at approval, because 0002 is in force until the grammar changes. How the
supersession is recorded is settled when the first successor takes effect (decision
0022).

## Rationale

The word tells a reader which level is meant. Decision 0002 itself describes a
property as the member that carries meaning and a field as a member that carries
data. Once ModelSpec stops claiming meaning
([decision 0017](0017-one-question-per-layer.md)), its member is a field by that
description. Record and field are also an established pair, and decision 0018 renames
the entity to a record.

Decision 0002's idea survives in a different place: three words for three levels,
not three words for three blocks of one language.

## Declined Alternatives

### property for both

The proposal's recommendation: `property` is on all 895 member lines of the
registered models, so the fewest lines would change. The owner chose `field` instead.
By decision 0002's own description a property is the member that carries meaning,
which ModelSpec no longer claims.

### Leave as is

Keep `property` in entities and `field` in components. Declined: two words for the
same thing in one language, with no difference in what they mean.

## Consequences at Decision Time

- Every member line of every registered model changes: 895 in nine models, counted on
  8 October 2026. They are rewritten by a command, not by hand, and generated models
  are regenerated.
- In a ModelSpec file, `property` can then only be the old spelling of `field`.
  Readers accept both spellings until the last registered model is pinned anew
  (decision 0022).
- The JSON key changes under the new format identifier that decision 0018 fixes.
- Readers and writers change in Phase 3, in this repository's site code and in other
  repositories.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*

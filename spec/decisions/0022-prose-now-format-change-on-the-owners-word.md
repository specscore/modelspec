---
format: https://specscore.md/decision-specification
status: Draft
---

# Decision: Prose Now, Format Change On The Owner's Word

**Status:** Draft
**Date:** 2026-10-08
**Owner:** alexander.trakhimenok@gmail.com
**Tags:** governance,sequencing,compatibility
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

Decisions [0018](0018-entity-becomes-record.md) and
[0020](0020-field-is-the-member-word.md) change keywords that every model uses, and
[decision 0019](0019-collection-and-recordset-removed-three-words-reserved.md)
changes the grammar every reader parses. The change is small at its centre and wide
at its edge: registered models are pinned by commit in the registry, and readers in
many repositories parse them independently.

Two things pulled in opposite directions when the decisions were approved. A launch
was in preparation, and a rename across many repositories shortly before a launch is
a risk with no benefit to it. And modelspec.org carried statements that were false
that day, which is a cost for as long as they stay.

The question was put to the owner as decision D13 of the conceptual design proposal
written for [issue 21](https://github.com/specscore/modelspec/issues/21).

Named unknown: SpecScore's decision format records a supersession of a whole
decision, and five of the seven decisions touched are succeeded or amended in part. How a
partial supersession is recorded is settled when the first successor takes effect.

## Decision

Prose is corrected now. The format changes only on the owner's word, and in stages.
The wording put to the owner:

> Correct the prose now. Start the format change only after you tell me the launch is
> done. Read both spellings until the last registered model is pinned anew; making
> the old spelling an error then needs its own approval.

The owner's answer, 8 October 2026: "Approve".

The phases, as the proposal names them:

| Phase | What it changes | Starts |
|---|---|---|
| 1. Say what is true | Prose in the specification and on modelspec.org. The approved decisions are recorded. No syntax. | Now, with the change that adds this file. |
| 2. The ModelSpec format | The grammar, the reference CLI, which reads both spellings and gains a rewrite command, its corpus, and the JSON Schema of decision 0010. | On the owner's word that the launch is done. |
| 3. The neighbours follow | Readers, then writers, in this repository's site code and in other repositories. The registered models are regenerated and pinned anew. | On the owner's word, after Phase 2. |

The rename is staged, in four steps:

1. Readers first. Every parser accepts both spellings.
2. Writers second. The specification, the generators, the registry index and the
   sites emit the new spelling.
3. Each registered model is regenerated and its pin moved.
4. The old spelling becomes an error only when no registered pin uses it, and only
   with its own approval.

### Takes effect

Now. It decides timing only.

### Decisions succeeded

None.

## Rationale

The condition for starting Phase 2 is the owner's word, not a date. The condition for
the last step is a count of zero old spellings at the registered pins, not a date
either.

The stages follow from one fact: a registered model is pinned by commit, and a pinned
commit keeps its spelling for ever. So both spellings have to be readable until the
last pin moves. Each of the first three steps can be undone cheaply. The fourth
cannot, which is why it has an approval of its own.

## Declined Alternatives

### Format change before the launch

Declined: a rename across many repositories shortly before a launch is a risk with no
benefit to the launch.

### Defer everything

Wait with the prose too. Declined: false statements on a public page are a cost
today, and correcting prose changes nothing a tool reads.

### A single cutover

Rename everything in one move. Declined: registered models are pinned by commit, so a
cutover would leave pinned models unreadable until every pin had moved.

## Consequences at Decision Time

- Decisions 0018 to 0021 are approved and not in force. `spec/README.md` lists them,
  and each says when it takes effect.
- The specification keeps describing the grammar that tools read today: `entity`,
  `property`, `collection` and `recordset`.
- Decisions 0002, 0003, 0004, 0007, 0009, 0014 and 0015 stay approved and unedited
  until their successors take effect. How each supersession is then recorded is the
  named unknown above: the `Supersedes` field archives a whole decision, and most of
  these are succeeded in part.
- Until Phase 2 a reader must check a decision's "Takes effect" section before
  treating it as the grammar.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*

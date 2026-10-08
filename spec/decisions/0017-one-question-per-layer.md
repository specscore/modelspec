---
format: https://specscore.md/decision-specification
status: Draft
---

# Decision: One Question Per Layer

**Status:** Draft
**Date:** 2026-10-08
**Owner:** alexander.trakhimenok@gmail.com
**Tags:** architecture,boundaries,meaninggraph,openvaultdb
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

ModelSpec's specification described its central construct in the words of a meaning
layer. `spec/core-model.md` called an entity "a logical business concept and semantic
anchor" and a property a "canonical semantic attribute". The Rationale of
[decision 0002](0002-property-field-column.md) uses the second phrase too.

Those words were written before MeaningGraph existed. MeaningGraph is a separate open
format whose job is to say what data means. Its format document opens: "A meaning
file says what the data in a dataset means: concepts with labels per language,
synonyms, a description, and bindings to ModelSpec entities and properties." So both
formats claimed meaning, and ModelSpec's specification did not mention MeaningGraph
once.

A third open format, OpenVaultDB, describes actual databases: where one is, what its
engine holds, and which model it follows.

The three do not line up one to one. In the public ModelSpec registry on 8 October
2026, four registered models hold customers, in four shapes: Chinook's `Customer` has
13 properties, Northwind's `Customers` 11, Sakila's `customer` 9 and AdventureWorks'
`Sales_Customer` 7.

The question was put to the owner as decision D1 of the conceptual design proposal
written for [issue 21](https://github.com/specscore/modelspec/issues/21).

## Decision

One question per layer. The wording put to the owner:

> One question per layer: MeaningGraph says what data means, ModelSpec what shape it
> has, OpenVaultDB where it is. Each fact has one home, chosen by how far it holds,
> and is written by hand there once. ModelSpec's text stops claiming meaning.

The owner's answer, 8 October 2026: "Approve".

The proposal spells out "chosen by how far it holds" in its section 5. These three
lines are the proposal's, not on the card the owner answered:

- What data means goes in MeaningGraph.
- What is true of the data in every database that holds it goes in ModelSpec.
- What is true of one database goes in OpenVaultDB.

### Takes effect

Phase 1, with the change that adds this file. The approval authorises editing prose
in the ModelSpec specification and on modelspec.org. It authorises no change of
syntax. [Decision 0022](0022-prose-now-format-change-on-the-owners-word.md) names the
phases.

### Decisions succeeded

None.

Recorder's note, not part of the owner's answer: the phrase "canonical semantic
attribute" also stands in the Rationale of decision 0002. That decision is approved
and is not edited. The specification no longer describes a property in those words.
What decision 0002 decides, three member words, stands until
[decision 0020](0020-field-is-the-member-word.md) takes effect.

## Rationale

Two formats that both claim meaning give a reader two places to look and no rule for
which one wins. The card put to the owner gives the reason in one line:

> Removes the contradiction between ModelSpec's "semantic anchor" and MeaningGraph's
> approved scope.

Meaning and shape also differ in how far they hold. A definition of a customer holds
for every model that has customers. Folding it into the model would copy it into four
registered models. Folding shape into meaning would put every dataset's list of
properties into a shared definition. Stated apart, one definition serves every model
that holds the data, and one model serves every database that follows it.

The rule says where a copy is an error. A fact typed by hand in two layers can drift,
and a checker can confirm only the lines that are present. With one home per fact,
the other layers point at it by address.

## Declined Alternatives

### Keep the wording

ModelSpec keeps calling an entity a semantic anchor. Declined: the contradiction with
MeaningGraph stays, and a reader cannot tell which format to ask what a name means.

### Two layers, with meaning folded into the model

The model carries the definitions. Declined: the definition of a customer would be
written once per shape, four times in today's registry, and the copies would drift.

### Two layers, with shape folded into meaning

A shared concept carries the properties. Declined: every dataset's own list of
properties, with its own names and types, would land in a definition that is meant to
be shared by all of them.

## Consequences at Decision Time

- `spec/core-model.md`, `spec/README.md`, the repository README and modelspec.org
  lose the two phrases and state the boundary.
- No grammar, CLI, JSON form, registry entry or model changes.
- ModelSpec stays independent, as decisions 0012 and 0014 require. A meaning file and
  a database's description point at a model; a model points at neither.
- The word "entity" still names different things in ModelSpec and in MeaningGraph.
  [Decision 0018](0018-entity-becomes-record.md) addresses that and is not in force.
- Statements on modelspec.org and in the specification that were false whatever the
  owner decided are corrected in the same change: that entities carry identity, that
  a vault plans migrations from a model, and the projection example, which is
  labelled as an example no tool reads.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*

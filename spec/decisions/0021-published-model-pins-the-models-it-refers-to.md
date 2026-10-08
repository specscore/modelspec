---
format: https://specscore.md/decision-specification
status: Draft
---

# Decision: A Published Model Pins The Models It Refers To

**Status:** Draft
**Date:** 2026-10-08
**Owner:** alexander.trakhimenok@gmail.com
**Tags:** model,references,modules,publishing
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

[Decision 0014](0014-module-qualified-references.md) lets a model refer to a concept
in another module by a qualified name, such as `entity = "orders.Order"`. It leaves
resolution to the consumer: ModelSpec says what the name means, and whoever reads the
model supplies the modules. The source names no host, path or repository.

That is enough where one consumer holds every module, as in a managed specification
tree. It is not enough for a model that is published on its own. Two readers of the
same published model can resolve `orders` to different models, or to different
commits of one model, and nothing in the published files says which was meant.

Today the reference CLI accepts a qualified reference when the other module's files
are supplied on the command line (`modelspec lint --module orders=<path>`). Its
publish profile refuses one (rule `publish-qualified-entity`), so a model that refers
to another repository's model cannot be registered.

The question was put to the owner inside decision D9 of the conceptual design
proposal written for [issue 21](https://github.com/specscore/modelspec/issues/21). D9
as a whole is about relationships between two databases and belongs to the tools
that use them; it is to be recorded there. This file records only the part of D9 that
amends decision 0014.

Named unknowns. The name and format of the file, and how the reference CLI reads it,
are not decided: they need a specification, which the approval authorises writing. A
rule for comparing keys of different types across two models, such as a `uuid` and a
string, is not defined either.

## Decision

A published model that refers to another model names that model and the commit it is
pinned to, in a short file beside the model, in the same repository. The wording put
to the owner, from the D9 card:

> The syntax exists (decision 0014). The CLI's publishing checks and the registry
> refuse it today. Publishing one needs the model to name the other model and its
> commit, in a short file beside it. That amends decision 0014, which says the
> consumer resolves a module's name and is recorded as yours.

The owner's answer to D9, 8 October 2026: "Approve".

The card said what the approval authorises: "a specification for that file, the
pairing of databases and the checks. Building them is Phase 7."

What does not change: the syntax of decision 0014. A model's source still says
`orders.Order` and still names no host, path or repository.

An illustration from the proposal, not a format: one line per module name, giving the
other model's address and commit.

```text
orders: modelspec://github.com/acme/orders-service/orders?ref=<commit>
```

### Takes effect

When the specification for the file is approved and built, which the proposal places
in its Phase 7, after the format phases. Nothing changes now: resolution stays
consumer-provided, and the publish profile keeps refusing a qualified reference.

### Decisions succeeded

When it takes effect, this decision amends one section of decision 0014, "Resolution
is consumer-provided", for published models only. A consumer that holds its own set
of modules keeps resolving them itself. The rest of 0014 stands: the qualified-name
form, its read-only meaning, the dependency it implies and the diagnostic for an
unresolved name.

Decision 0014 stays approved and unedited, and this file's `Supersedes` field is
empty, because 0014 is in force as written until the file exists. The amendment is
recorded when this decision takes effect.

Recorder's note, not part of the owner's answer. The proposal's author read the
approval as covering the amendment named on the card, and told the owner so as a
reading to correct; no correction is recorded.

## Rationale

A reference between two models is the shared home of a relationship that no single
database declares, including one between two databases. It can be shared only if a
published model resolves the same way for every reader. The publisher is the party
who knows which model and which commit was meant, so the publisher states it, once,
next to the model.

Keeping the statement in a file beside the model, and out of the model's source,
keeps what decision 0014 protects: source-level names stay short and portable, and
packaging stays out of the language.

## Declined Alternatives

### Leave resolution wholly to the consumer

Decision 0014 as written. Declined for published models: either publishing stays
refused, or two readers may resolve one name to two models.

### Put the address in the model's source

An import statement or a URL-style reference. Declined: decision 0014 already
declined both, because they put packaging into the language, and nothing here changes
that reasoning.

### State a relationship between two databases as a foreign key

Describe the link on one database's side, as if its engine enforced it. Declined: no
engine enforces a reference into another database, and the statement would belong to
one deployment, where two databases that hold the same data could not share it.

## Consequences at Decision Time

- The publish profile and the registry's converter must accept a qualified name from
  another repository once the file exists.
- The check stays local to each reference: the entity that is referred to, and its
  key, must exist at the pinned commit. Two models may refer to each other.
- ModelSpec gains no way to add a reference to somebody else's entity from outside.
  A qualified reference stays read-only, as decision 0014 says, and is written on the
  referring side.
- A model that refers to a model nobody has published cannot be published until that
  model is.

## Observed Consequences

None observed yet.

## Affected Features

None at this time.

---
*This document follows the https://specscore.md/decision-specification*

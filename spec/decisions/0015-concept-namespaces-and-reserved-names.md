---
format: https://specscore.md/decision-specification
status: Approved
---

# Decision: Concept Namespaces And Reserved Names

**Status:** Approved
**Date:** 2026-07-08
**Owner:** alexander.trakhimenok@gmail.com
**Tags:** model,namespaces,references,collections,recordsets
**Source Idea:** —
**Supersedes:** —
**Superseded By:** —

## Context

The spec said names "MUST be unique within their scopes" without saying whether
entity, component, and enum names share one scope or three. The first consumer
validator took the strict reading — one flat namespace — because its bare-name
reference form (`<module>.<Name>`, the consumer-side counterpart of
[decision 0014](0014-module-qualified-references.md)) would otherwise need a kind
selector on every reference. Separately, consumers needed to address collections
and recordsets (e.g. a feature specification declaring, machine-checkably, that
it reads a particular recordset), which had no address at all; and the only thing
distinguishing concept kinds in prose was casing convention, which is not a
grammar.

## Decision

1. **The referenceable trio shares one namespace.** Entity, component, and enum
   names occupy ONE flat namespace per module. A consumer's bare concept
   reference (`<module>.<Name>`) resolves in exactly this trio, which is what
   makes the kind-free form sound.
2. **Collections and recordsets get their own scopes** (one each, per module).
   They are addressable by consumers only in kind-explicit form — never by bare
   name — so their names never constrain, and are never constrained by, the trio.
3. **Five reserved names.** `entities`, `components`, `enums`, `collections`,
   `recordsets` are forbidden as concept names in any scope. They are the kind
   tokens of consumer reference syntax (e.g. SpecScore's
   `modelspec:///<module>.<kind>.<Name>` — SpecScore decision 0011); reserving
   them keeps kind-explicit references unambiguous without lookahead.

ModelSpec remains consumer-neutral: the reference URI grammar itself belongs to
consumers (SpecScore decisions 0010/0011); ModelSpec owns only the name scopes
and reservations that make any such grammar resolvable. HCL qualified names
([decision 0014](0014-module-qualified-references.md)) are unchanged — the
attribute name (`entity = …`, `component = …`, `enum = …`) is already the kind
selector.

## Rationale

Namespace rules are what make reference grammars sound; leaving them implicit
turned a load-bearing rule into validator folklore. The trio-shares-one-scope
reading is the one that keeps the ergonomic kind-free reference form
unambiguous, and separate scopes for storage projections keep infrastructure
names out of domain vocabulary. Five reserved words are the entire cost.

## Declined Alternatives

### Three separate scopes for the trio

Forces a kind selector into every consumer reference — triple-encoding: the
consumer's referencing field, the kind segment, and the block type would all
encode the same fact.

### Casing conventions as the disambiguator

`entity "Vault"` vs `collection "vaults"` happens to read well, but a grammar
whose correctness depends on naming style is not a grammar.

### Making collections and recordsets bare-name referenceable

Would force all five kinds into one namespace, making every storage-projection
name compete with domain vocabulary.

## Consequences at Decision Time

- `hcl-authoring.md` states the scopes and reserved names normatively.
- Validators reject same-named concepts within the trio and reserved-token
  concept names.
- Kind-explicit consumer references can address collections and recordsets;
  bare-name references stay entity/component/enum only.

## Observed Consequences

None observed yet.

## Affected Features

- —

---
*This document follows the https://specscore.md/decision-specification*
